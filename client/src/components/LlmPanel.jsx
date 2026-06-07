import { useEffect, useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, FormControl, FormLabel, FormHelperText, Input, Switch,
  Button, Select, Alert, AlertIcon, Badge, Divider, Flex, Spacer, useToast, Code,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import api from '../api.js';

export default function LlmPanel({ config, onSaveConfig }) {
  const toast = useToast();
  const [llm, setLlm] = useState(() => ({ ...config.llm }));
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const dirty = ['enabled', 'baseUrl', 'model', 'apiKey'].some(
    (k) => (llm[k] ?? '') !== (config.llm?.[k] ?? '')
  );

  const check = async () => {
    setChecking(true);
    try {
      const s = await api.llmStatus();
      setStatus(s);
    } catch (err) {
      setStatus({ reachable: false, models: [], error: err.message });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { check(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true);
    try {
      await onSaveConfig({ ...config, llm });
      toast({ title: 'LLM settings saved', status: 'success' });
      check();
    } catch {
      /* handled upstream */
    } finally {
      setSaving(false);
    }
  };

  const models = status?.models || [];

  return (
    <VStack align="stretch" spacing={5} maxW="760px" mx="auto">
      <Box>
        <Heading size="lg">Local LLM (optional)</Heading>
        <Text color="gray.500">
          Connect a local model via <b>LM Studio</b> for plain-English summaries and an advisory second opinion.
          Everything stays on your machine. The heuristic score is always the source of truth.
        </Text>
      </Box>

      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
        <VStack align="stretch" spacing={4}>
          <FormControl display="flex" alignItems="center">
            <Switch isChecked={!!llm.enabled} onChange={(e) => setLlm({ ...llm, enabled: e.target.checked })} mr={3} />
            <FormLabel mb={0}>Enable local LLM features</FormLabel>
          </FormControl>

          <FormControl>
            <FormLabel>LM Studio base URL</FormLabel>
            <Input value={llm.baseUrl} onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })} placeholder="http://127.0.0.1:1234/v1" />
            <FormHelperText>Default is <Code>http://127.0.0.1:1234/v1</Code>. Start the server in LM Studio's Developer tab.</FormHelperText>
          </FormControl>

          <FormControl>
            <FormLabel>API key (usually not required)</FormLabel>
            <Input value={llm.apiKey || ''} onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })} placeholder="lm-studio" />
          </FormControl>

          <Divider />

          <Flex align="center">
            <Heading size="sm">Connection</Heading>
            <Spacer />
            <Button size="sm" leftIcon={<FiRefreshCw />} variant="outline" colorScheme="gray" onClick={check} isLoading={checking}>Test</Button>
          </Flex>

          {status && (
            status.reachable ? (
              models.length ? (
                <Alert status="success" borderRadius="md"><AlertIcon />Connected. {models.length} model(s) available.</Alert>
              ) : (
                <Alert status="warning" borderRadius="md"><AlertIcon />Reachable, but no model is loaded. Load one in LM Studio.</Alert>
              )
            ) : (
              <Alert status="error" borderRadius="md"><AlertIcon />Not reachable. {status.error || 'Is the LM Studio server running?'}</Alert>
            )
          )}

          <FormControl>
            <FormLabel>Model</FormLabel>
            <Select
              value={llm.model || ''}
              onChange={(e) => setLlm({ ...llm, model: e.target.value })}
              placeholder={models.length ? 'Select a model…' : 'No models found'}
              isDisabled={!models.length}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.id}{m.state === 'loaded' ? ' (loaded)' : ''}</option>
              ))}
            </Select>
            {status?.loadedModel && <FormHelperText>Currently loaded: <Badge>{status.loadedModel}</Badge></FormHelperText>}
          </FormControl>

          {dirty && (
            <Alert status="warning" borderRadius="md" fontSize="sm" py={2}>
              <AlertIcon />Unsaved changes — click <b>Save</b> for them to take effect.
            </Alert>
          )}
          <Flex>
            <Spacer />
            <Button onClick={save} isLoading={saving} colorScheme={dirty ? 'orange' : 'brand'}>Save LLM settings</Button>
          </Flex>
        </VStack>
      </Box>

      <Alert status="info" borderRadius="md" variant="left-accent">
        <AlertIcon />
        <Box fontSize="sm">
          QueryQuery never sends queries to the cloud. With the LLM off, every feature still works — only the
          optional summaries and advisory triage are unavailable.
        </Box>
      </Alert>
    </VStack>
  );
}

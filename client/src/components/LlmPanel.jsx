import { useEffect, useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, FormControl, FormLabel, FormHelperText, Input, Switch,
  Button, Select, Alert, AlertIcon, Badge, Divider, Flex, Spacer, useToast, Code, useClipboard,
} from '@chakra-ui/react';
import { FiRefreshCw, FiCopy } from 'react-icons/fi';
import api from '../api.js';

function LlmError({ status }) {
  const d = status.detail || {};
  const respText = d.body || d.message || JSON.stringify(d, null, 2);
  const { onCopy, hasCopied } = useClipboard(respText || '');
  return (
    <Alert status="error" borderRadius="md" flexDirection="column" alignItems="stretch" gap={2} fontSize="sm">
      <HStack><AlertIcon /><Text fontWeight="600">{status.reachable ? `Request failed: ${status.error}` : `Not reachable — ${status.error || 'is the server running?'}`}</Text></HStack>
      {d.isCloudflareAccess ? (
        <Text pl={6}>
          Behind <b>Cloudflare Access</b> (Zero Trust). Add {d.detectedIp ? <Code colorScheme="red" fontWeight="700">{d.detectedIp}</Code> : 'your server’s egress IP'} to
          an Access <b>bypass</b> policy — or configure a service token. (A plain IP allow-list won’t cover Access.)
        </Text>
      ) : d.detectedIp ? (
        <Text pl={6}>
          Looks like an IP allow-list block. Add this IP: <Code colorScheme="red" fontWeight="700">{d.detectedIp}</Code>
        </Text>
      ) : null}
      {(d.url || d.status || d.contentType || d.server || d.cfRay) && (
        <Text pl={6} fontSize="xs" color="gray.700">
          {d.status ? `${d.status} ${d.statusText || ''} · ` : ''}{d.contentType || ''}{d.server ? ` · server: ${d.server}` : ''}{d.cfRay ? ` · ray: ${d.cfRay}` : ''}
          {d.url ? <Text as="span" color="gray.500"> · {d.url}</Text> : null}
        </Text>
      )}
      {respText && (
        <Box pl={6}>
          <HStack justify="space-between" mb={1}>
            <Text fontSize="xs" color="gray.600">Full response</Text>
            <Button size="xs" variant="outline" leftIcon={<FiCopy />} onClick={onCopy}>{hasCopied ? 'Copied' : 'Copy'}</Button>
          </HStack>
          <Code display="block" whiteSpace="pre-wrap" wordBreak="break-word" fontSize="xs" maxH="240px" overflowY="auto" p={2} w="100%">
            {respText}
          </Code>
        </Box>
      )}
    </Alert>
  );
}

const DEFAULT_LLM = { enabled: false, baseUrl: 'http://127.0.0.1:1234/v1', model: '', apiKey: 'lm-studio' };

export default function LlmPanel() {
  const toast = useToast();
  const [llm, setLlm] = useState(DEFAULT_LLM);
  const [loaded, setLoaded] = useState(null);
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    api.getLlmConfig()
      .then(({ llm: l }) => { const v = { ...DEFAULT_LLM, ...(l || {}) }; setLoaded(v); setLlm(v); })
      .catch(() => setLoaded(DEFAULT_LLM));
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = loaded && ['enabled', 'baseUrl', 'model', 'apiKey'].some((k) => (llm[k] ?? '') !== (loaded[k] ?? ''));

  const save = async () => {
    setSaving(true);
    try {
      const { llm: l } = await api.saveLlmConfig(llm);
      setLoaded({ ...DEFAULT_LLM, ...l });
      toast({ title: 'LLM settings saved', status: 'success' });
      check();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, status: 'error' });
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
            status.reachable && !status.error ? (
              models.length ? (
                <Alert status="success" borderRadius="md"><AlertIcon />Connected. {models.length} model(s) available.</Alert>
              ) : (
                <Alert status="warning" borderRadius="md"><AlertIcon />Reachable, but no model is loaded. Load one in LM Studio.</Alert>
              )
            ) : (
              <LlmError status={status} />
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

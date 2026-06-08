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
      {d.egress?.host && (
        <Text pl={6}>
          Cloudflare saw your server as <Code colorScheme="red" fontWeight="700">{d.egress.host}</Code> for this host — add <b>exactly this</b> to the {d.isCloudflareAccess ? 'Access bypass policy' : 'allow-list'}.
        </Text>
      )}
      {d.egress && (d.egress.v4 || d.egress.v6) && (
        <Text pl={6} fontSize="sm" color="gray.700">
          Your server’s egress — IPv4: <Code>{d.egress.v4 || '—'}</Code> · IPv6: <Code>{d.egress.v6 || '—'}</Code>.
          {d.egress.v4 && d.egress.v6 ? ' Dual-stack: the connection may use either, so add BOTH (an IPv4-only rule won’t cover an IPv6 connection — likely your issue).' : ''}
        </Text>
      )}
      {d.isCloudflareAccess && !d.egress?.host && !d.egress?.v4 && !d.egress?.v6 && (
        <Text pl={6}>Behind <b>Cloudflare Access</b> (Zero Trust) — add your server’s egress IP to an Access <b>bypass</b> policy, or use a service token.</Text>
      )}
      {d.labeledIp && (
        <Text pl={6} fontSize="xs" color="gray.600">Page also reports a client IP: <Code fontSize="xs">{d.labeledIp}</Code></Text>
      )}
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

const DEFAULT_LLM = { enabled: false, baseUrl: 'http://127.0.0.1:1234/v1', model: '' };

export default function LlmPanel() {
  const toast = useToast();
  const [llm, setLlm] = useState(DEFAULT_LLM);
  const [loaded, setLoaded] = useState(null);
  const [apiKey, setApiKey] = useState(''); // write-only: blank = keep the saved key
  const [apiKeySet, setApiKeySet] = useState(false);
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

  const applyConfig = (l) => {
    const v = { enabled: !!l?.enabled, baseUrl: l?.baseUrl || DEFAULT_LLM.baseUrl, model: l?.model || '' };
    setLoaded(v);
    setLlm(v);
    setApiKeySet(!!l?.apiKeySet);
  };

  useEffect(() => {
    api.getLlmConfig()
      .then(({ llm: l }) => applyConfig(l))
      .catch(() => setLoaded(DEFAULT_LLM));
    check();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty =
    (loaded && ['enabled', 'baseUrl', 'model'].some((k) => (llm[k] ?? '') !== (loaded[k] ?? ''))) || apiKey !== '';

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...llm };
      if (apiKey) payload.apiKey = apiKey; // only send a key when the user typed one
      const { llm: l } = await api.saveLlmConfig(payload);
      applyConfig(l);
      setApiKey('');
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
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeySet ? '•••••••• (saved)' : 'lm-studio'}
            />
            {apiKeySet && <FormHelperText>A key is saved. Type a new one to replace it; leave blank to keep it.</FormHelperText>}
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

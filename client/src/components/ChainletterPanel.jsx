import { useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, FormControl, FormLabel, FormHelperText, Input, Switch,
  Button, Alert, AlertIcon, Flex, Spacer, useToast, Code, SimpleGrid, Badge,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import api from '../api.js';
import ClGlyph from './ClGlyph.jsx';

export default function ChainletterPanel({ config, onSaveConfig }) {
  const toast = useToast();
  const [cl, setCl] = useState(() => ({ ...config.chainletter }));
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const set = (patch) => setCl((c) => ({ ...c, ...patch }));

  const dirty = ['enabled', 'tokenUrl', 'verifyUrlTemplate'].some(
    (k) => (cl[k] ?? '') !== (config.chainletter?.[k] ?? '')
  );

  // Claiming a token is single-use, so we save first and test against the saved
  // config — that way the claim (and its cached jwt/webhook) belongs to this token.
  const test = async () => {
    setTesting(true);
    try {
      if (dirty) await onSaveConfig({ ...config, chainletter: cl }, { silent: true });
      setStatus(await api.chainletterTest());
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSaveConfig({ ...config, chainletter: cl });
      toast({ title: 'Chainletter settings saved', status: 'success' });
    } catch {
      /* handled upstream */
    } finally {
      setSaving(false);
    }
  };

  return (
    <VStack align="stretch" spacing={5} maxW="760px" mx="auto">
      <Box>
        <HStack><ClGlyph h="1.2em" /><Heading size="lg">Chainletter — Certify Receipt</Heading></HStack>
        <Text color="gray.500" mt={1}>
          Store each author’s original letter on Chainletter’s <b>private</b> network (not public, not IPFS) and
          blockchain-stamp it, so they can later prove their idea was submitted to and read by a human.
          A value-add for authors worried about AI idea-theft.
        </Text>
      </Box>

      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
        <VStack align="stretch" spacing={4}>
          <FormControl display="flex" alignItems="center">
            <Switch isChecked={!!cl.enabled} onChange={(e) => set({ enabled: e.target.checked })} mr={3} />
            <FormLabel mb={0}>Enable “Certify Receipt”</FormLabel>
          </FormControl>

          <FormControl>
            <FormLabel>Chainletter token URL</FormLabel>
            <Input
              value={cl.tokenUrl || ''}
              onChange={(e) => set({ tokenUrl: e.target.value })}
              placeholder="https://server.clstamp.com/jwt/yourtoken"
            />
            <FormHelperText>
              The only field you need. QueryQuery claims it once to get the webhook URL, JWT and group — then caches
              and reuses them until the token expires. (Format <Code fontSize="xs">https://{'{server}'}/jwt/{'{token}'}</Code>.)
              <b> Each token URL can only be claimed once</b>, so paste a fresh one if it’s already been used.
            </FormHelperText>
          </FormControl>

          <Flex align="center">
            <Heading size="sm">Connection</Heading>
            <Spacer />
            <Button size="sm" leftIcon={<FiRefreshCw />} variant="outline" colorScheme="gray" onClick={test} isLoading={testing} isDisabled={!cl.tokenUrl}>Test</Button>
          </Flex>
          {status && (
            <Alert status={status.ok ? 'success' : 'error'} borderRadius="md" fontSize="sm" py={2} flexDirection="column" alignItems="stretch" gap={2}>
              <HStack><AlertIcon />{status.message}</HStack>
              {status.tenant && (
                <SimpleGrid columns={2} spacing={1} fontSize="xs" pl={6} color="gray.700">
                  <Text>Tenant: <b>{status.tenant}</b></Text>
                  <Text>Folder: <b>{status.folder}</b></Text>
                  {status.expires && <Text>Expires: <b>{status.expires}</b></Text>}
                  {status.status && <Text>Status: <Badge colorScheme={/active/i.test(status.status) ? 'green' : 'orange'}>{status.status}</Badge></Text>}
                </SimpleGrid>
              )}
            </Alert>
          )}

          {dirty && (
            <Alert status="warning" borderRadius="md" fontSize="sm" py={2}>
              <AlertIcon />Unsaved changes — click <b>Save</b> for them to take effect. Certifying uses your saved settings.
            </Alert>
          )}
          <Flex>
            <Spacer />
            <Button onClick={save} isLoading={saving} leftIcon={<ClGlyph />} colorScheme={dirty ? 'orange' : 'brand'}>Save Chainletter settings</Button>
          </Flex>
        </VStack>
      </Box>

      <Alert status="info" borderRadius="md" variant="left-accent">
        <AlertIcon />
        <Box fontSize="sm">
          The letter is uploaded to Chainletter’s <b>private</b> network (visible only to your account — not public,
          not on IPFS) and blockchain-stamped. The on-chain record is its IPFS hash (CIDv0).
        </Box>
      </Alert>
    </VStack>
  );
}

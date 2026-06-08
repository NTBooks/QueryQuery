import { useEffect, useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, FormControl, FormLabel, FormHelperText, Input, Switch,
  Button, Alert, AlertIcon, Flex, Spacer, useToast, Code, SimpleGrid, Badge, Spinner,
} from '@chakra-ui/react';
import { FiRefreshCw } from 'react-icons/fi';
import api from '../api.js';
import ClGlyph from './ClGlyph.jsx';

export default function ChainletterPanel() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(null); // saved server state {enabled, tokenUrl, claimed}
  const [cl, setCl] = useState({ enabled: false, tokenUrl: '' });
  const [status, setStatus] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getChainletter()
      .then((s) => { setLoaded(s); setCl({ enabled: !!s.enabled, tokenUrl: s.tokenUrl || '' }); })
      .catch((e) => toast({ title: 'Failed to load', description: e.message, status: 'error' }));
  }, [toast]);

  const set = (patch) => setCl((c) => ({ ...c, ...patch }));
  const dirty = loaded && (cl.enabled !== !!loaded.enabled || (cl.tokenUrl || '') !== (loaded.tokenUrl || ''));

  const save = async () => {
    setSaving(true);
    try {
      const s = await api.saveChainletter({ enabled: cl.enabled, tokenUrl: cl.tokenUrl });
      setLoaded(s);
      toast({ title: 'Chainletter settings saved', status: 'success' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, status: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // Claiming is single-use, so save first and test against the saved token.
  const test = async () => {
    setTesting(true);
    try {
      if (dirty) {
        const s = await api.saveChainletter({ enabled: cl.enabled, tokenUrl: cl.tokenUrl });
        setLoaded(s);
      }
      setStatus(await api.chainletterTest());
    } catch (e) {
      setStatus({ ok: false, message: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (!loaded) {
    return <HStack color="gray.500" justify="center" py={10}><Spinner size="sm" /><Text>Loading…</Text></HStack>;
  }

  return (
    <VStack align="stretch" spacing={5} maxW="760px" mx="auto">
      <Box>
        <HStack><ClGlyph h="1.2em" /><Heading size="lg">Chainletter — Certify Receipt</Heading></HStack>
        <Text color="gray.500" mt={1}>
          Blockchain-stamp a fingerprint (base64) of each author’s letter and hand them the proof token to keep,
          so they can later prove their idea was submitted to and read by a human. These credentials are
          <b> yours</b> — each user configures their own Chainletter token.
        </Text>
      </Box>

      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
        <VStack align="stretch" spacing={4}>
          <FormControl display="flex" alignItems="center">
            <Switch isChecked={!!cl.enabled} onChange={(e) => set({ enabled: e.target.checked })} mr={3} />
            <FormLabel mb={0}>Enable “Certify Receipt”</FormLabel>
            {loaded.claimed && <Badge ml={3} colorScheme="green">token claimed</Badge>}
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
          Only a small base64 fingerprint of the letter text is sent (privately) to get an on-chain stamp; the
          author keeps that token and can verify its hash (an IPFS CIDv0) on the blockchain anytime.
        </Box>
      </Alert>
    </VStack>
  );
}

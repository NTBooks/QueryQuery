// "Where do my files go?" helper: shows the input folder's absolute path, the
// .eml files currently in it, and how to export emails from common clients.
import { useEffect, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  Box, Flex, HStack, VStack, Text, Heading, Button, IconButton, Code, Badge, Divider,
  Accordion, AccordionItem, AccordionButton, AccordionPanel, AccordionIcon, Alert, AlertIcon,
  useClipboard, Spinner, List, ListItem, UnorderedList,
} from '@chakra-ui/react';
import { FiCopy, FiCheck, FiRefreshCw, FiInbox, FiFolder } from 'react-icons/fi';
import api from '../api.js';

const CLIENTS = [
  {
    name: 'Apple Mail (Mac)',
    steps: [
      'Select the query emails in your inbox.',
      'Drag them into this folder in Finder — each saves as a .eml file.',
      'Or: File ▸ Save As ▸ Format “Raw Message Source”.',
    ],
  },
  {
    name: 'Thunderbird',
    steps: [
      'Select one or more messages.',
      'Drag them straight into this folder (saves as .eml), or right-click ▸ Save As.',
      'For bulk export, install the “ImportExportTools NG” add-on ▸ Export all messages ▸ EML format.',
    ],
  },
  {
    name: 'Gmail (web)',
    steps: [
      'Open a query email.',
      'Click ⋮ (More) ▸ “Download message” — this saves an .eml file.',
      'Move the downloaded .eml into this folder. (Gmail downloads one at a time.)',
    ],
  },
  {
    name: 'Outlook',
    steps: [
      'New Outlook / Outlook on the web: open a message ▸ ⋮ ▸ Save as / Download ▸ choose .eml, then move it here.',
      'Classic Outlook saves .msg (not .eml) when you drag emails out — QueryQuery reads .eml, so use the Download/Save-as-.eml option, or convert .msg → .eml first.',
    ],
  },
  {
    name: 'Any other IMAP client',
    steps: [
      'Most desktop clients let you select multiple messages and drag them into a system folder, saving each as .eml.',
      'Then point this folder at them (or copy them in) and Scan.',
    ],
  },
];

function fmtSize(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export default function InboxModal({ isOpen, onClose, onScan }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const { onCopy, hasCopied } = useClipboard(info?.path || '');

  const load = async () => {
    setLoading(true);
    try {
      setInfo(await api.inbox());
    } catch {
      setInfo({ path: '(unknown)', exists: false, count: 0, files: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <HStack><FiFolder /><Text>Input folder</Text></HStack>
        </ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={5}>
            <Alert status="success" borderRadius="md" fontSize="sm" py={2}>
              <AlertIcon />
              <Box>
                <b>Easiest:</b> drag <code>.eml</code> files straight onto the QueryQuery window — they’re saved and
                scored automatically. You can also drop them in the folder below, or use the <b>Paste</b> tab.
              </Box>
            </Alert>
            <Box>
              <Text fontSize="sm" color="gray.600" mb={1}>This folder is also watched — drop <b>.eml</b> files here and they’re scanned automatically:</Text>
              <Flex align="center" gap={2} bg="gray.50" borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2}>
                <Code flex="1" bg="transparent" fontSize="sm" whiteSpace="pre-wrap" wordBreak="break-all">
                  {info?.path || '…'}
                </Code>
                <IconButton aria-label="Copy path" size="sm" variant="ghost"
                  icon={hasCopied ? <FiCheck /> : <FiCopy />} onClick={onCopy} isDisabled={!info?.path} />
              </Flex>
              {info && !info.exists && (
                <Alert status="warning" mt={2} borderRadius="md" fontSize="sm" py={2}>
                  <AlertIcon />This folder doesn’t exist yet — it’s created on first run. Start the app once, or create it manually.
                </Alert>
              )}
            </Box>

            <Box>
              <Flex align="center" mb={2}>
                <Heading size="xs">Files in this folder</Heading>
                <Badge ml={2} colorScheme={info?.count ? 'green' : 'gray'}>{info?.count ?? 0}</Badge>
                <IconButton aria-label="Refresh" ml="auto" size="xs" variant="ghost" icon={<FiRefreshCw />} onClick={load} isLoading={loading} />
              </Flex>
              {loading ? (
                <HStack color="gray.500" fontSize="sm"><Spinner size="sm" /><Text>Reading folder…</Text></HStack>
              ) : info?.files?.length ? (
                <Box maxH="200px" overflowY="auto" borderWidth="1px" borderColor="gray.200" borderRadius="md">
                  <List spacing={0}>
                    {info.files.map((f) => (
                      <ListItem key={f.name} px={3} py={1.5} borderBottomWidth="1px" borderColor="gray.100" fontSize="sm">
                        <Flex justify="space-between" gap={3}>
                          <Text noOfLines={1}>{f.name}</Text>
                          <Text color="gray.400" flexShrink={0}>{fmtSize(f.size)}</Text>
                        </Flex>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ) : (
                <Flex direction="column" align="center" justify="center" py={6} color="gray.400" gap={2} borderWidth="1px" borderStyle="dashed" borderColor="gray.300" borderRadius="md">
                  <FiInbox size={28} />
                  <Text fontSize="sm">No .eml files here yet.</Text>
                </Flex>
              )}
            </Box>

            {info?.archives?.length > 0 && (
              <Box>
                <Heading size="xs" mb={2}>
                  Archived batches <Badge ml={1} colorScheme="purple">{info.archives.length}</Badge>
                </Heading>
                <Text fontSize="xs" color="gray.500" mb={2}>Processed emails are zipped here and removed from the inbox. Certified receipts still read the originals from these zips.</Text>
                <Box maxH="140px" overflowY="auto" borderWidth="1px" borderColor="gray.200" borderRadius="md">
                  <List spacing={0}>
                    {info.archives.map((a) => (
                      <ListItem key={a.name} px={3} py={1.5} borderBottomWidth="1px" borderColor="gray.100" fontSize="sm">
                        <Flex justify="space-between" gap={3}>
                          <Text noOfLines={1}>{a.name}</Text>
                          <Text color="gray.400" flexShrink={0}>{fmtSize(a.size)}</Text>
                        </Flex>
                      </ListItem>
                    ))}
                  </List>
                </Box>
              </Box>
            )}

            <Divider />

            <Box>
              <Heading size="xs" mb={2}>Exporting emails into this folder</Heading>
              <Accordion allowToggle>
                {CLIENTS.map((c) => (
                  <AccordionItem key={c.name}>
                    <AccordionButton px={2}>
                      <Box as="span" flex="1" textAlign="left" fontWeight="600" fontSize="sm">{c.name}</Box>
                      <AccordionIcon />
                    </AccordionButton>
                    <AccordionPanel pb={3} px={2}>
                      <UnorderedList spacing={1} fontSize="sm" color="gray.700">
                        {c.steps.map((s, i) => <ListItem key={i}>{s}</ListItem>)}
                      </UnorderedList>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
              <Text fontSize="xs" color="gray.500" mt={3}>
                Tip: subject lines like <Code fontSize="xs">Query: TITLE / Genre</Code> help detection but aren’t required.
                You can also use the <b>Paste</b> tab to add a single letter by hand.
              </Text>
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button variant="ghost" colorScheme="gray" onClick={onClose}>Close</Button>
          <Button leftIcon={<FiInbox />} onClick={() => { onScan?.(); onClose(); }}>Scan Inbox</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

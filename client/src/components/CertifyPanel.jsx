// "Certify Receipt" — blockchain-stamp a hash of the original letter, then show
// the verification link and a copy-paste reply for the author.
import { useState } from 'react';
import {
  Box, Flex, Button, Heading, Text, VStack, HStack, Badge, Alert, AlertIcon, Code, Link,
  useClipboard, useToast,
} from '@chakra-ui/react';
import { FiShield, FiCopy, FiCheck, FiExternalLink, FiDownload } from 'react-icons/fi';
import api from '../api.js';
import ClGlyph from './ClGlyph.jsx';

function CopyButton({ value, label = 'Copy' }) {
  const { onCopy, hasCopied } = useClipboard(value || '');
  return (
    <Button size="xs" variant="outline" colorScheme="gray" leftIcon={hasCopied ? <FiCheck /> : <FiCopy />} onClick={onCopy} isDisabled={!value}>
      {hasCopied ? 'Copied' : label}
    </Button>
  );
}

function downloadFile(filename, content, type = 'text/plain') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function replyToEml(reply) {
  return [`To: ${reply.to || ''}`, `Subject: ${reply.subject || ''}`, 'Content-Type: text/plain; charset=utf-8', '', reply.body || ''].join('\r\n');
}

function DownloadButton({ filename, content, type, label }) {
  return (
    <Button size="xs" variant="outline" colorScheme="gray" leftIcon={<FiDownload />} onClick={() => downloadFile(filename, content, type)} isDisabled={!content}>
      {label}
    </Button>
  );
}

export default function CertifyPanel({ ticket, config, onCertified }) {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  if (!config?.chainletter?.enabled) {
    return (
      <Alert status="info" borderRadius="md" fontSize="sm">
        <AlertIcon />Enable Chainletter in the “Chainletter” tab to certify receipts.
      </Alert>
    );
  }

  const cert = ticket.cl_result || null;
  const reply = cert?.reply;

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const out = await api.certify(ticket.id);
      onCertified(out.ticket);
      toast({
        title: out.alreadyExists ? 'Stamped (hash already on file)' : 'Receipt certified',
        description: `${out.stamp?.files_stamped ?? ''} file(s) stamped.`,
        status: 'success',
      });
    } catch (e) {
      setErr({ message: e.message, debug: e.debug });
      toast({ title: 'Certification failed', description: e.message, status: 'error' });
    } finally {
      setLoading(false);
      setConfirming(false);
    }
  };

  if (ticket.cl_stamped && cert) {
    return (
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Badge colorScheme="green"><HStack spacing={1}><FiShield /><Text>Certified</Text></HStack></Badge>
          {ticket.cl_stamped_at && <Text fontSize="xs" color="gray.500">{new Date(ticket.cl_stamped_at).toLocaleString()}</Text>}
          {cert.stamp?.files_stamped != null && <Text fontSize="xs" color="gray.500">· {cert.stamp.files_stamped} stamped</Text>}
        </HStack>

        <Box>
          <Text fontSize="xs" color="gray.500" mb={1}>IPFS hash (CIDv0)</Text>
          <HStack>
            <Code fontSize="xs" wordBreak="break-all" flex="1">{ticket.cl_cid}</Code>
            <CopyButton value={ticket.cl_cid} />
          </HStack>
        </Box>

        {cert.verifyUrl && (
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Verification link</Text>
            <HStack>
              <Link href={cert.verifyUrl} isExternal color="brand.600" fontSize="sm" wordBreak="break-all" flex="1">
                {cert.verifyUrl} <FiExternalLink style={{ display: 'inline' }} />
              </Link>
              <CopyButton value={cert.verifyUrl} />
            </HStack>
          </Box>
        )}

        {cert.stampData && (
          <Box>
            <Flex justify="space-between" align="center" mb={1}>
              <Text fontSize="xs" color="gray.500">Proof token (base64 — the author keeps this to verify later)</Text>
              <DownloadButton filename={`proof-${ticket.cl_cid}.txt`} content={cert.stampData} label="Download" />
            </Flex>
            <HStack align="start">
              <Code fontSize="xs" wordBreak="break-all" whiteSpace="pre-wrap" maxH="110px" overflowY="auto" flex="1">{cert.stampData}</Code>
              <CopyButton value={cert.stampData} />
            </HStack>
          </Box>
        )}

        {reply && (
          <Box borderWidth="1px" borderColor="gray.200" borderRadius="md" p={3}>
            <Flex justify="space-between" align="center">
              <Heading size="xs">Reply to author</Heading>
              <HStack>
                <DownloadButton filename={`reply-${ticket.id}.eml`} content={replyToEml(reply)} type="message/rfc822" label="Download .eml" />
                <CopyButton value={`To: ${reply.to}\nSubject: ${reply.subject}\n\n${reply.body}`} label="Copy reply" />
              </HStack>
            </Flex>
            <VStack align="stretch" spacing={1} mt={2} fontSize="sm">
              <Text><b>To:</b> {reply.to || '(no address found)'}</Text>
              <Text><b>Subject:</b> {reply.subject}</Text>
              <Box mt={1} bg="gray.50" borderRadius="md" p={2} whiteSpace="pre-wrap" fontFamily="Georgia, serif">{reply.body}</Box>
            </VStack>
          </Box>
        )}
      </VStack>
    );
  }

  return (
    <VStack align="stretch" spacing={3}>
      <Text fontSize="sm" color="gray.600">
        Blockchain-stamp a fingerprint (base64) of this author’s <b>letter text</b> and send them the
        <b> proof token</b> to keep. They can verify it against the blockchain anytime — the letter isn’t shared publicly.
      </Text>
      {!confirming ? (
        <Button leftIcon={<ClGlyph />} colorScheme="green" onClick={() => setConfirming(true)} alignSelf="flex-start">
          Certify Receipt
        </Button>
      ) : (
        <Alert status="warning" borderRadius="md" flexDirection="column" alignItems="stretch" gap={2}>
          <HStack><AlertIcon /><Text fontSize="sm">This permanently records a blockchain postmark and can’t be undone.</Text></HStack>
          <HStack>
            <Button size="sm" colorScheme="green" onClick={run} isLoading={loading} loadingText="Stamping…">Stamp now</Button>
            <Button size="sm" variant="ghost" colorScheme="gray" onClick={() => setConfirming(false)} isDisabled={loading}>Cancel</Button>
          </HStack>
        </Alert>
      )}

      {err && (
        <Alert status="error" borderRadius="md" flexDirection="column" alignItems="stretch" gap={2} fontSize="sm">
          <HStack><AlertIcon /><Text fontWeight="600">{err.message}</Text></HStack>
          {err.debug && (
            <Box pl={6} fontSize="xs" color="gray.700">
              <Text>Endpoint: <Code fontSize="xs">{err.debug.method} {err.debug.endpoint}</Code></Text>
              <Text>group-id: <Code fontSize="xs">{err.debug.groupId || '∅'}</Code> · auth: <Code fontSize="xs">{err.debug.authMode || 'NONE'}</Code> · HTTP {err.debug.status}</Text>
              {err.debug.detail && <Text mt={1}>Server said: <i>{err.debug.detail}</i></Text>}
            </Box>
          )}
        </Alert>
      )}
    </VStack>
  );
}

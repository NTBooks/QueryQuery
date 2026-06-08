import { useEffect, useState } from 'react';
import {
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  Button, VStack, HStack, Text, Textarea, Box, Badge, Divider, Spinner, useToast, Heading, Flex,
} from '@chakra-ui/react';
import { FiArchive, FiRotateCcw } from 'react-icons/fi';
import api from '../api.js';

export default function ArchiveModal({ isOpen, onClose, activeCount, onChanged }) {
  const toast = useToast();
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [archives, setArchives] = useState(null);

  const load = () => {
    setArchives(null);
    api.listArchives().then(({ archives: a }) => setArchives(a)).catch(() => setArchives([]));
  };
  useEffect(() => { if (isOpen) { setComment(''); load(); } }, [isOpen]);

  const archive = async () => {
    setBusy(true);
    try {
      const out = await api.archiveBoard(comment);
      toast({ title: `Archived ${out.count} card(s)`, description: `Iteration #${out.iteration}`, status: 'success' });
      setComment('');
      load();
      onChanged?.();
    } catch (e) {
      toast({ title: 'Archive failed', description: e.message, status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const restore = async (iter) => {
    try {
      const out = await api.restoreArchive(iter);
      toast({ title: `Restored ${out.restored} card(s)`, status: 'success' });
      load();
      onChanged?.();
    } catch (e) {
      toast({ title: 'Restore failed', description: e.message, status: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Archive board</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={4}>
            <Box>
              <Text fontSize="sm" color="gray.600" mb={2}>
                Tag all <b>{activeCount}</b> current card(s) with the next iteration and move them off the board.
                Archived iterations can be restored anytime.
              </Text>
              <Textarea
                placeholder="Archive comment (e.g. “Spring 2026 reading period”)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
              />
            </Box>

            <Divider />

            <Box>
              <Heading size="xs" mb={2}>Past archives</Heading>
              {archives === null ? (
                <HStack color="gray.500" fontSize="sm"><Spinner size="sm" /><Text>Loading…</Text></HStack>
              ) : archives.length === 0 ? (
                <Text fontSize="sm" color="gray.400">No archived iterations yet.</Text>
              ) : (
                <VStack align="stretch" spacing={2} maxH="240px" overflowY="auto">
                  {archives.map((a) => (
                    <Flex key={a.iteration} align="center" gap={3} borderWidth="1px" borderColor="gray.200" borderRadius="md" p={2}>
                      <Badge colorScheme="purple">#{a.iteration}</Badge>
                      <Box flex="1" minW={0}>
                        <Text fontSize="sm" noOfLines={1}>{a.comment || <Text as="span" color="gray.400">(no comment)</Text>}</Text>
                        <Text fontSize="xs" color="gray.500">{a.count} card(s){a.at ? ` · ${new Date(a.at).toLocaleString()}` : ''}</Text>
                      </Box>
                      <Button size="xs" leftIcon={<FiRotateCcw />} variant="outline" onClick={() => restore(a.iteration)}>Restore</Button>
                    </Flex>
                  ))}
                </VStack>
              )}
            </Box>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>Close</Button>
          <Button colorScheme="brand" leftIcon={<FiArchive />} onClick={archive} isLoading={busy} isDisabled={!activeCount}>
            Archive {activeCount} card(s)
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

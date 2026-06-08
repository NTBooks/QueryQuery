import { useMemo, useState } from 'react';
import {
  Box, Heading, Text, VStack, HStack, SimpleGrid, FormControl, FormLabel, FormHelperText,
  Slider, SliderTrack, SliderFilledTrack, SliderThumb, Switch, NumberInput, NumberInputField,
  Button, Divider, Badge, Flex, Input, Spacer, Select, useToast, useDisclosure,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter, Alert, AlertIcon,
} from '@chakra-ui/react';
import { FiCopy, FiTrash2, FiSave } from 'react-icons/fi';
import { Select as RSelect } from 'chakra-react-select';
import { genreLabel, metricLabel } from '../lib/format.js';

function Section({ title, subtitle, children }) {
  return (
    <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
      <Heading size="sm">{title}</Heading>
      {subtitle && <Text fontSize="sm" color="gray.500" mt={1} mb={3}>{subtitle}</Text>}
      <Box mt={subtitle ? 0 : 3}>{children}</Box>
    </Box>
  );
}

const fromOpts = (opts) => (opts || []).map((o) => o.value);
const parseCsv = (s) => s.split(',').map((x) => x.trim()).filter(Boolean);

export default function ConfigForm({
  meta, config, busy,
  profiles = [], activeProfile = '',
  onSelectProfile, onSaveProfile, onDeleteProfile,
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(config)));
  const copyModal = useDisclosure();
  const deleteModal = useDisclosure();
  const [copyName, setCopyName] = useState('');

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  // Save the current draft into the active profile (re-scores the board upstream).
  const saveActive = async () => {
    try { await onSaveProfile?.(activeProfile, draft); } catch { /* toast upstream */ }
  };
  // Save a copy under a new name (becomes the active profile).
  const saveCopy = async () => {
    const name = copyName.trim();
    if (!name) return;
    try {
      await onSaveProfile?.(name, draft);
      copyModal.onClose();
      setCopyName('');
    } catch { /* toast upstream */ }
  };
  const confirmDelete = async () => {
    try { await onDeleteProfile?.(activeProfile); deleteModal.onClose(); } catch { /* toast upstream */ }
  };

  // Comma-separated text fields (kept as raw strings while typing, parsed to arrays).
  const [csv, setCsv] = useState(() => ({
    wantedAuthors: (config.wantedAuthors || []).join(', '),
    wantedComps: (config.wantedComps || []).join(', '),
    keywordsWanted: (config.keywordsWanted || []).join(', '),
    keywordsAvoid: (config.keywordsAvoid || []).join(', '),
  }));
  const setCsvField = (field, value) => {
    setCsv((c) => ({ ...c, [field]: value }));
    set({ [field]: parseCsv(value) });
  };

  const genreOptions = useMemo(
    () => (meta?.genres || []).map((g) => ({ value: g.key, label: g.label })),
    [meta]
  );

  const weightSum = useMemo(
    () => Object.values(draft.weights || {}).reduce((a, b) => a + (Number(b) || 0), 0) || 1,
    [draft.weights]
  );

  const onlyProfile = profiles.length <= 1;

  return (
    <VStack align="stretch" spacing={5} maxW="900px" mx="auto">
      <Box>
        <Heading size="lg">Configuration</Heading>
        <Text color="gray.500">Shape what you're looking for into a score. All scoring is heuristic — no AI.</Text>
      </Box>

      {/* Profile bar: pick what you're scoring against; save/copy/delete. */}
      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={4}>
        <Flex align="center" gap={3} wrap="wrap">
          <Box>
            <Text fontSize="xs" color="gray.500" mb={1}>Profile</Text>
            <Select
              size="sm" minW="200px" maxW="260px" value={activeProfile}
              onChange={(e) => onSelectProfile?.(e.target.value)} isDisabled={busy}
            >
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Box>
          <Spacer />
          <HStack spacing={2} pt={5}>
            <Button size="sm" colorScheme="brand" leftIcon={<FiSave />} onClick={saveActive} isLoading={busy}>Save</Button>
            <Button size="sm" variant="outline" leftIcon={<FiCopy />} onClick={() => { setCopyName(`${activeProfile} copy`); copyModal.onOpen(); }} isDisabled={busy}>Save a copy</Button>
            <Button size="sm" variant="outline" colorScheme="red" leftIcon={<FiTrash2 />} onClick={deleteModal.onOpen} isDisabled={busy || onlyProfile} title={onlyProfile ? 'Keep at least one profile' : undefined}>Delete</Button>
          </HStack>
        </Flex>
        <Text fontSize="xs" color="gray.500" mt={2}>Selecting or saving a profile re-scores the whole board.</Text>
      </Box>

      <Section title="What you represent" subtitle="Genres you want boost a query's score; everything else is scored lower (but still shown).">
        <FormControl>
          <FormLabel>Wanted genres</FormLabel>
          <RSelect
            isMulti
            options={genreOptions}
            value={(draft.wantedGenres || []).map((k) => genreOptions.find((o) => o.value === k)).filter(Boolean)}
            onChange={(vals) => set({ wantedGenres: fromOpts(vals) })}
            placeholder="Select genres…"
          />
        </FormControl>
      </Section>

      <Section title="Look for specific mentions" subtitle="Reward queries that name these authors / comp titles / keywords. Type them separated by commas.">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
          <FormControl>
            <FormLabel>Wanted authors (comps)</FormLabel>
            <Input value={csv.wantedAuthors} onChange={(e) => setCsvField('wantedAuthors', e.target.value)} placeholder="e.g. Madeline Miller, V.E. Schwab" />
            <FormHelperText>Separate multiple with commas.</FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel>Wanted comp titles</FormLabel>
            <Input value={csv.wantedComps} onChange={(e) => setCsvField('wantedComps', e.target.value)} placeholder="e.g. The Night Circus, Babel" />
            <FormHelperText>Separate multiple with commas.</FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel>Keywords to favor</FormLabel>
            <Input value={csv.keywordsWanted} onChange={(e) => setCsvField('keywordsWanted', e.target.value)} placeholder="e.g. found family, sapphic, heist" />
            <FormHelperText>Separate multiple with commas.</FormHelperText>
          </FormControl>
          <FormControl>
            <FormLabel>Keywords to avoid</FormLabel>
            <Input value={csv.keywordsAvoid} onChange={(e) => setCsvField('keywordsAvoid', e.target.value)} placeholder="e.g. vampire, zombie" />
            <FormHelperText>Separate multiple with commas.</FormHelperText>
          </FormControl>
        </SimpleGrid>
      </Section>

      <Section title="Metric weights" subtitle="Drag to set how much each signal matters. Weights are normalized to 100%.">
        <VStack align="stretch" spacing={4}>
          {Object.entries(draft.weights || {}).map(([k, v]) => (
            <Box key={k}>
              <Flex justify="space-between" fontSize="sm" mb={1}>
                <Text fontWeight="600">{metricLabel(meta, k)}</Text>
                <Text color="gray.500">{Math.round((v / weightSum) * 100)}%</Text>
              </Flex>
              <Slider
                value={Number(v) || 0}
                min={0}
                max={40}
                step={1}
                onChange={(val) => set({ weights: { ...draft.weights, [k]: val } })}
              >
                <SliderTrack><SliderFilledTrack /></SliderTrack>
                <SliderThumb boxSize={5} />
              </Slider>
            </Box>
          ))}
        </VStack>
      </Section>

      <Section title="AI signals" subtitle="Heuristic AI-suspicion is advisory and does not change the main score by default. Detection uses no AI.">
        <VStack align="stretch" spacing={4}>
          <FormControl display="flex" alignItems="center">
            <Switch isChecked={!!draft.aiSuspicion?.enabled} onChange={(e) => set({ aiSuspicion: { ...draft.aiSuspicion, enabled: e.target.checked } })} mr={3} />
            <FormLabel mb={0}>Compute AI-suspicion sub-score</FormLabel>
          </FormControl>
          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <FormControl>
              <FormLabel>Flag as "possible AI" at score ≥</FormLabel>
              <NumberInput min={0} max={100} value={draft.aiSuspicion?.thresholds?.suspicionFlagAt ?? 60}
                onChange={(_, n) => set({ aiSuspicion: { ...draft.aiSuspicion, thresholds: { ...draft.aiSuspicion.thresholds, suspicionFlagAt: Number.isNaN(n) ? 60 : n } } })}>
                <NumberInputField />
              </NumberInput>
            </FormControl>
            <FormControl>
              <FormLabel>Weight in main score (advanced)</FormLabel>
              <NumberInput min={0} max={30} value={draft.aiSuspicion?.weightInMainScore ?? 0}
                onChange={(_, n) => set({ aiSuspicion: { ...draft.aiSuspicion, weightInMainScore: Number.isNaN(n) ? 0 : n } })}>
                <NumberInputField />
              </NumberInput>
              <FormHelperText>0 = advisory only (recommended).</FormHelperText>
            </FormControl>
          </SimpleGrid>
        </VStack>
      </Section>

      <Section title="Genre word-count bands" subtitle="Debut-friendly ranges per genre. Queries outside the band lose word-count points.">
        <SimpleGrid columns={{ base: 1, md: 2 }} spacingX={6} spacingY={3}>
          {Object.entries(draft.genres || {}).map(([key, band]) => (
            <Flex key={key} align="center" gap={2}>
              <Text flex="1" fontSize="sm">{genreLabel(meta, key) || key}</Text>
              <NumberInput size="sm" maxW="100px" value={band.min} min={0} step={1000}
                onChange={(_, n) => set({ genres: { ...draft.genres, [key]: { ...band, min: Number.isNaN(n) ? band.min : n } } })}>
                <NumberInputField />
              </NumberInput>
              <Text color="gray.400">–</Text>
              <NumberInput size="sm" maxW="100px" value={band.max} min={0} step={1000}
                onChange={(_, n) => set({ genres: { ...draft.genres, [key]: { ...band, max: Number.isNaN(n) ? band.max : n } } })}>
                <NumberInputField />
              </NumberInput>
            </Flex>
          ))}
        </SimpleGrid>
      </Section>

      <Section title="Swimlane score bands" subtitle="The rows on your board. Edit labels and ranges.">
        <VStack align="stretch" spacing={2}>
          {(draft.scoreBands || []).map((b, i) => (
            <HStack key={b.key}>
              <Input size="sm" value={b.label} maxW="220px"
                onChange={(e) => { const next = [...draft.scoreBands]; next[i] = { ...b, label: e.target.value }; set({ scoreBands: next }); }} />
              <NumberInput size="sm" maxW="90px" value={b.min} min={0} max={100}
                onChange={(_, n) => { const next = [...draft.scoreBands]; next[i] = { ...b, min: Number.isNaN(n) ? b.min : n }; set({ scoreBands: next }); }}>
                <NumberInputField />
              </NumberInput>
              <Text color="gray.400">–</Text>
              <NumberInput size="sm" maxW="90px" value={b.max} min={0} max={100}
                onChange={(_, n) => { const next = [...draft.scoreBands]; next[i] = { ...b, max: Number.isNaN(n) ? b.max : n }; set({ scoreBands: next }); }}>
                <NumberInputField />
              </NumberInput>
            </HStack>
          ))}
        </VStack>
      </Section>

      <Flex>
        <Spacer />
        <Button onClick={saveActive} isLoading={busy} size="lg" leftIcon={<FiSave />}>
          Save &amp; re-score "{activeProfile}"
        </Button>
      </Flex>

      {/* Save a copy */}
      <Modal isOpen={copyModal.isOpen} onClose={copyModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Save a copy</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <FormControl>
              <FormLabel>New profile name</FormLabel>
              <Input
                value={copyName} autoFocus maxLength={40}
                onChange={(e) => setCopyName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveCopy(); }}
                placeholder="e.g. Cozy mysteries"
              />
              <FormHelperText>Saves the current settings as a new profile and switches to it.</FormHelperText>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={copyModal.onClose}>Cancel</Button>
            <Button colorScheme="brand" onClick={saveCopy} isLoading={busy} isDisabled={!copyName.trim()}>Save copy</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Delete confirmation */}
      <Modal isOpen={deleteModal.isOpen} onClose={deleteModal.onClose} isCentered>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Delete profile</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Alert status="warning" borderRadius="md" fontSize="sm">
              <AlertIcon />
              Delete profile <b>&nbsp;"{activeProfile}"</b>? This can't be undone. The board will re-score against the next profile.
            </Alert>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={deleteModal.onClose}>Cancel</Button>
            <Button colorScheme="red" onClick={confirmDelete} isLoading={busy}>Delete</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </VStack>
  );
}

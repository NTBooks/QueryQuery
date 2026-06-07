// AI-assist panel: when heuristics miss fields (genre, word count, title, comps)
// AND a local LLM is on, let the model fuzzily identify them. Discovered comps
// (authors/titles) and keywords are added to the scoring config ONE AT A TIME —
// the agent curates exactly what they want, nothing is bulk-imported.
import { useState } from 'react';
import {
  Box, Button, Heading, Text, VStack, HStack, Wrap, WrapItem, Badge, SimpleGrid, Alert, AlertIcon, useToast,
} from '@chakra-ui/react';
import { FiZap, FiPlus, FiCheck } from 'react-icons/fi';
import api from '../api.js';

const uniqMerge = (arr, value) => [...new Set([...(arr || []), String(value).trim()].filter(Boolean))];

function missingFields(components) {
  const md = components?.metadata || {};
  const m = [];
  if (!md.genreKey) m.push('genre');
  if (md.wordCount == null) m.push('word count');
  if (!md.title) m.push('title');
  if (!components?.comps?.present || !components?.comps?.count) m.push('comp titles');
  return m;
}

export default function AiAssist({ payload, components, config, llmEnabled, llmReachable, existingExtract, onExtract, onSaveConfig }) {
  const toast = useToast();
  const [extract, setExtract] = useState(existingExtract || null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState({});

  if (!llmEnabled) return null;
  const missing = missingFields(components);
  if (missing.length === 0 && !extract) return null; // only when heuristics fell short

  const run = async () => {
    setLoading(true);
    try {
      const out = await api.extract(payload);
      setExtract(out.extract);
      onExtract?.(out.extract);
    } catch (err) {
      toast({ title: 'AI identify failed', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const addOne = async (field, value) => {
    const key = `${field}:${value}`;
    if (added[key]) return;
    try {
      await onSaveConfig({ ...config, [field]: uniqMerge(config[field], value) }, { silent: true });
      setAdded((s) => ({ ...s, [key]: true }));
    } catch {
      /* handled upstream */
    }
  };

  // A single click-to-add chip for one discovered value.
  const AddChip = ({ field, value }) => {
    const key = `${field}:${value}`;
    const done = added[key] || (config[field] || []).some((x) => String(x).toLowerCase() === String(value).toLowerCase());
    return (
      <Button
        size="xs"
        variant={done ? 'solid' : 'outline'}
        colorScheme={done ? 'green' : 'purple'}
        leftIcon={done ? <FiCheck /> : <FiPlus />}
        isDisabled={done}
        onClick={() => addOne(field, value)}
        mb={1}
        fontWeight="500"
      >
        {value}
      </Button>
    );
  };

  const comps = extract?.comps || [];
  const compAuthors = [...new Set(comps.map((c) => c.author).filter(Boolean))];
  const compTitles = [...new Set(comps.map((c) => c.title).filter(Boolean))];
  const themes = [...new Set([...(extract?.themes || []), ...(extract?.keywords || [])])];

  return (
    <Box borderWidth="1px" borderColor="purple.200" bg="purple.50" borderRadius="md" p={4}>
      <HStack mb={2}>
        <FiZap />
        <Heading size="xs">AI assist</Heading>
        <Badge colorScheme="purple">fuzzy</Badge>
      </HStack>

      {!llmReachable ? (
        <Alert status="warning" borderRadius="md" fontSize="sm" py={2}><AlertIcon />LM Studio is not reachable.</Alert>
      ) : !extract ? (
        <>
          <Text fontSize="sm" color="gray.600" mb={2}>
            Heuristics couldn’t identify: <b>{missing.join(', ')}</b>. Let the local model take a look.
          </Text>
          <Button size="sm" leftIcon={<FiZap />} colorScheme="purple" onClick={run} isLoading={loading} loadingText="Identifying…">
            Identify with AI
          </Button>
        </>
      ) : (
        <VStack align="stretch" spacing={3}>
          <Text fontSize="xs" color="gray.500">AI suggestions — click any item to add it to your Configuration, then re-score.</Text>
          <SimpleGrid columns={2} spacing={1} fontSize="sm">
            <Text>Genre: <b>{extract.genre || '—'}</b></Text>
            <Text>Word count: <b>{extract.wordCount ? extract.wordCount.toLocaleString() : '—'}</b></Text>
            <Text>Title: <b>{extract.title || '—'}</b></Text>
            <Text>Audience: <b>{extract.ageCategory || '—'}</b></Text>
          </SimpleGrid>

          {(compAuthors.length > 0 || compTitles.length > 0) && (
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={1}>Comps found</Text>
              <VStack align="stretch" spacing={0} mb={2}>
                {comps.map((c, i) => (
                  <Text key={i} fontSize="sm" color="gray.600">• {c.title}{c.author ? ` — ${c.author}` : ''}{c.year ? ` (${c.year})` : ''}</Text>
                ))}
              </VStack>
              {compAuthors.length > 0 && (
                <>
                  <Text fontSize="xs" color="gray.500">Add an author to your wishlist:</Text>
                  <Wrap mb={1}>{compAuthors.map((a) => <WrapItem key={a}><AddChip field="wantedAuthors" value={a} /></WrapItem>)}</Wrap>
                </>
              )}
              {compTitles.length > 0 && (
                <>
                  <Text fontSize="xs" color="gray.500">Add a comp title:</Text>
                  <Wrap>{compTitles.map((t) => <WrapItem key={t}><AddChip field="wantedComps" value={t} /></WrapItem>)}</Wrap>
                </>
              )}
            </Box>
          )}

          {themes.length > 0 && (
            <Box>
              <Text fontSize="sm" fontWeight="600" mb={1}>Themes &amp; keywords <Text as="span" fontWeight="400" color="gray.500">— click to add</Text></Text>
              <Wrap>{themes.map((k) => <WrapItem key={k}><AddChip field="keywordsWanted" value={k} /></WrapItem>)}</Wrap>
            </Box>
          )}
        </VStack>
      )}
    </Box>
  );
}

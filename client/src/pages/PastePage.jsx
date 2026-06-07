import { useEffect, useState } from 'react';
import {
  Box, Grid, GridItem, Flex, HStack, VStack, Heading, Text, Textarea, Input, Button, Badge,
  FormControl, FormLabel, FormHelperText, useToast, Spacer, Alert, AlertIcon,
} from '@chakra-ui/react';
import { FiZap, FiPlus } from 'react-icons/fi';
import api from '../api.js';
import AnalysisDetail from '../components/AnalysisDetail.jsx';
import AiAssist from '../components/AiAssist.jsx';
import { scoreColor, bandColor, genreLabel, fmtWords } from '../lib/format.js';

export default function PastePage({ meta, config, onAdded, onSaveConfig }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [llmReachable, setLlmReachable] = useState(false);

  useEffect(() => {
    if (config?.llm?.enabled) {
      api.llmStatus().then((s) => setLlmReachable(!!s.reachable)).catch(() => setLlmReachable(false));
    }
  }, [config]);

  // Editing the input invalidates a stale analysis.
  const onText = (v) => { setText(v); if (analysis) setAnalysis(null); };
  const onSubject = (v) => { setSubject(v); if (analysis) setAnalysis(null); };

  const analyze = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      const a = await api.analyze({ text, subject });
      setAnalysis(a);
    } catch (err) {
      toast({ title: 'Analysis failed', description: err.message, status: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const addToBoard = async () => {
    setAdding(true);
    try {
      const ticket = await api.createTicket({ text, subject, fromName });
      onAdded(ticket);
      toast({ title: 'Added to board', description: `Scored ${ticket.score} — ${ticket.score_band.replace('_', ' ')}.`, status: 'success' });
      setText(''); setSubject(''); setFromName(''); setAnalysis(null);
    } catch (err) {
      toast({ title: 'Could not add', description: err.message, status: 'error' });
    } finally {
      setAdding(false);
    }
  };

  const band = analysis ? (config?.scoreBands || []).find((b) => b.key === analysis.score_band) : null;
  const md = analysis?.components?.metadata || {};

  return (
    <Box maxW="1100px" mx="auto">
      <Box mb={5}>
        <Heading size="lg">Paste &amp; analyze</Heading>
        <Text color="gray.500">Paste a query letter to see its heuristic breakdown. Add it to the board if you want to keep it.</Text>
      </Box>

      <Grid templateColumns={{ base: '1fr', lg: '1fr 1fr' }} gap={5} alignItems="start">
        {/* INPUT */}
        <GridItem>
          <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5}>
            <VStack align="stretch" spacing={4}>
              <FormControl>
                <FormLabel>Query letter</FormLabel>
                <Textarea
                  value={text}
                  onChange={(e) => onText(e.target.value)}
                  placeholder="Paste the full query letter here…"
                  rows={16}
                  fontFamily="Georgia, serif"
                />
              </FormControl>
              <HStack align="start" spacing={4}>
                <FormControl>
                  <FormLabel>Subject (optional)</FormLabel>
                  <Input value={subject} onChange={(e) => onSubject(e.target.value)} placeholder="Query: TITLE / Genre" />
                  <FormHelperText>Helps detect genre &amp; word count.</FormHelperText>
                </FormControl>
                <FormControl>
                  <FormLabel>Sender (optional)</FormLabel>
                  <Input value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Author name" />
                </FormControl>
              </HStack>
              <HStack>
                <Button leftIcon={<FiZap />} onClick={analyze} isLoading={loading} isDisabled={!text.trim()}>
                  Analyze
                </Button>
                {(text || analysis) && (
                  <Button variant="ghost" colorScheme="gray" onClick={() => { setText(''); setSubject(''); setFromName(''); setAnalysis(null); }}>
                    Clear
                  </Button>
                )}
              </HStack>
            </VStack>
          </Box>
        </GridItem>

        {/* RESULTS */}
        <GridItem>
          <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="lg" p={5} minH="200px">
            {!analysis ? (
              <Flex h="100%" minH="180px" align="center" justify="center" direction="column" gap={2} color="gray.400">
                <FiZap size={28} />
                <Text>Paste a letter and click <b>Analyze</b>.</Text>
              </Flex>
            ) : (
              <VStack align="stretch" spacing={4}>
                <Flex align="center" gap={3}>
                  <Badge colorScheme={scoreColor(analysis.score)} fontSize="1.3em" px={3} py={1} borderRadius="md">{analysis.score}</Badge>
                  <Box>
                    <HStack>
                      <Badge colorScheme={bandColor(analysis.score_band)}>{band?.label || analysis.score_band}</Badge>
                      {md.genreKey && <Badge colorScheme="blue">{genreLabel(meta, md.genreKey)}</Badge>}
                      {md.wordCount != null && <Badge>{fmtWords(md.wordCount)}</Badge>}
                    </HStack>
                    <Text fontSize="xs" color="gray.500" mt={1}>Heuristic score (0–100)</Text>
                  </Box>
                  <Spacer />
                  <Button leftIcon={<FiPlus />} onClick={addToBoard} isLoading={adding}>Add to board</Button>
                </Flex>
                <Alert status="info" borderRadius="md" fontSize="sm" py={2}>
                  <AlertIcon />Nothing is saved until you click “Add to board”.
                </Alert>
                <AiAssist
                  payload={{ text, subject }}
                  components={analysis.components}
                  config={config}
                  llmEnabled={config?.llm?.enabled}
                  llmReachable={llmReachable}
                  onSaveConfig={onSaveConfig}
                  onExtract={(ex) => {
                    if (!ex) return;
                    if (!subject.trim() && ex.title) {
                      setSubject(`Query: ${ex.title}${ex.genre ? ` / ${ex.genre}` : ''}`);
                    }
                    if (!fromName.trim() && ex.authorName) setFromName(ex.authorName);
                  }}
                />
                <AnalysisDetail analysis={analysis} meta={meta} config={config} />
              </VStack>
            )}
          </Box>
        </GridItem>
      </Grid>
    </Box>
  );
}

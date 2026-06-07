import { useEffect, useState } from 'react';
import {
  Drawer, DrawerOverlay, DrawerContent, DrawerCloseButton, DrawerHeader, DrawerBody,
  Box, Flex, HStack, VStack, Text, Badge, Heading, Divider, Button, Wrap, WrapItem,
  Tabs, TabList, TabPanels, Tab, TabPanel, Progress, Tooltip, Alert, AlertIcon, Stat,
  StatLabel, StatNumber, SimpleGrid, Code, useToast, ButtonGroup,
} from '@chakra-ui/react';
import api from '../api.js';
import { scoreColor, bandColor, genreLabel, fmtWords, STATUS_COLOR } from '../lib/format.js';
import { ScoreSection, ComponentsSection } from './AnalysisDetail.jsx';
import AiAssist from './AiAssist.jsx';
import CertifyPanel from './CertifyPanel.jsx';

export default function TicketDrawer({ isOpen, onClose, ticket, meta, config, onStatus, onUpdated, onSaveConfig }) {
  const toast = useToast();
  const [llm, setLlm] = useState({ reachable: false, models: [], loadedModel: null });
  const [working, setWorking] = useState(null);

  useEffect(() => {
    if (isOpen && config?.llm?.enabled) {
      api.llmStatus().then(setLlm).catch(() => setLlm({ reachable: false, models: [], loadedModel: null }));
    }
  }, [isOpen, config]);

  if (!ticket) return null;
  const c = ticket.components || {};
  const md = c.metadata || {};
  const title = md.title || ticket.subject || '(untitled)';

  const runLlm = async (kind) => {
    setWorking(kind);
    try {
      if (kind === 'summarize') {
        const out = await api.summarize(ticket.id, config?.llm?.model);
        onUpdated({ id: ticket.id, llm_summary: out.summary });
      } else {
        const out = await api.triage(ticket.id, config?.llm?.model);
        onUpdated({ id: ticket.id, llm_triage: out.triage });
      }
    } catch (err) {
      toast({ title: 'LLM request failed', description: err.message, status: 'error' });
    } finally {
      setWorking(null);
    }
  };

  const changeStatus = (s) => {
    onStatus(ticket.id, s);
    onUpdated({ id: ticket.id, status: s });
  };

  return (
    <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="lg">
      <DrawerOverlay />
      <DrawerContent>
        <DrawerCloseButton />
        <DrawerHeader borderBottomWidth="1px">
          <HStack align="start" spacing={3}>
            <Badge colorScheme={scoreColor(ticket.score)} fontSize="1.1em" px={3} py={1} borderRadius="md">{ticket.score}</Badge>
            <Box>
              <Heading size="md" noOfLines={2}>{title}</Heading>
              <Text fontSize="sm" color="gray.500">{ticket.from_name} {ticket.from_addr ? `<${ticket.from_addr}>` : ''}</Text>
              <HStack mt={1}>
                <Badge colorScheme={bandColor(ticket.score_band)}>{(config?.scoreBands || []).find((b) => b.key === ticket.score_band)?.label || ticket.score_band}</Badge>
                {md.genreKey && <Badge colorScheme="blue">{genreLabel(meta, md.genreKey)}</Badge>}
                {md.wordCount != null && <Badge>{fmtWords(md.wordCount)}</Badge>}
              </HStack>
            </Box>
          </HStack>
        </DrawerHeader>

        <DrawerBody p={0}>
          {/* Status changer */}
          <Box px={5} py={3} bg="gray.50" borderBottomWidth="1px">
            <Text fontSize="xs" color="gray.500" mb={1}>Move to</Text>
            <ButtonGroup size="sm" isAttached={false} flexWrap="wrap" spacing={2}>
              {(meta?.states || []).map((s) => (
                <Button
                  key={s.key}
                  variant={ticket.status === s.key ? 'solid' : 'outline'}
                  colorScheme={STATUS_COLOR[s.key] || 'gray'}
                  onClick={() => changeStatus(s.key)}
                >
                  {s.label}
                </Button>
              ))}
            </ButtonGroup>
          </Box>

          <Tabs colorScheme="brand" px={5} pt={2}>
            <TabList>
              <Tab>Score</Tab>
              <Tab>Components</Tab>
              <Tab>Letter</Tab>
              <Tab>Local LLM</Tab>
              <Tab>Receipt</Tab>
            </TabList>

            <TabPanels>
              {/* SCORE */}
              <TabPanel px={0}>
                <ScoreSection analysis={ticket} meta={meta} config={config} />
              </TabPanel>

              {/* COMPONENTS */}
              <TabPanel px={0}>
                <ComponentsSection analysis={ticket} meta={meta} />
              </TabPanel>

              {/* LETTER */}
              <TabPanel px={0}>
                <Box bg="gray.50" borderRadius="md" p={4} whiteSpace="pre-wrap" fontSize="sm" fontFamily="Georgia, serif" maxH="60vh" overflowY="auto">
                  {ticket.body || '(empty)'}
                </Box>
              </TabPanel>

              {/* LLM */}
              <TabPanel px={0}>
                {!config?.llm?.enabled ? (
                  <Alert status="info" borderRadius="md"><AlertIcon />Local LLM is disabled. Enable it in the "Local LLM" tab.</Alert>
                ) : !llm.reachable ? (
                  <Alert status="warning" borderRadius="md"><AlertIcon />LM Studio is not reachable. Start its local server.</Alert>
                ) : !llm.loadedModel ? (
                  <Alert status="warning" borderRadius="md"><AlertIcon />No model loaded in LM Studio.</Alert>
                ) : (
                  <VStack align="stretch" spacing={4}>
                    <Box>
                      <HStack>
                        <Button size="sm" onClick={() => runLlm('summarize')} isLoading={working === 'summarize'} loadingText="Thinking…">Summarize</Button>
                        <Button size="sm" variant="outline" onClick={() => runLlm('triage')} isLoading={working === 'triage'} loadingText="Thinking…">Advisory triage</Button>
                        <Text fontSize="xs" color="gray.500">model: {config?.llm?.model || llm.loadedModel}</Text>
                      </HStack>
                      <Text fontSize="xs" color="gray.400" mt={1}>Runs locally. Small models answer in seconds; large reasoning models can take 1–2 minutes.</Text>
                    </Box>
                    {ticket.llm_summary && (
                      <Box><Heading size="xs" mb={1}>Summary <Badge ml={1}>LLM</Badge></Heading><Text fontSize="sm">{ticket.llm_summary}</Text></Box>
                    )}
                    {ticket.llm_triage && (
                      <Box>
                        <Heading size="xs" mb={1}>Advisory triage <Badge ml={1}>LLM suggestion</Badge></Heading>
                        {ticket.llm_triage.suggestedStatus && (
                          <Badge colorScheme={STATUS_COLOR[ticket.llm_triage.suggestedStatus] || 'gray'} mb={2}>
                            suggests: {ticket.llm_triage.suggestedStatus.replace('_', ' ')}
                          </Badge>
                        )}
                        {ticket.llm_triage.summary && <Text fontSize="sm" mb={2}>{ticket.llm_triage.summary}</Text>}
                        {ticket.llm_triage.reasons?.length > 0 && (
                          <VStack align="start" fontSize="xs" color="gray.600" spacing={0}>
                            {ticket.llm_triage.reasons.map((r, i) => <Text key={i}>• {r}</Text>)}
                          </VStack>
                        )}
                        <Text fontSize="xs" color="gray.400" mt={2}>This is an LLM suggestion. The heuristic score and your decision stand.</Text>
                      </Box>
                    )}
                    <AiAssist
                      key={ticket.id}
                      payload={{ id: ticket.id }}
                      components={ticket.components}
                      config={config}
                      llmEnabled={config?.llm?.enabled}
                      llmReachable={llm.reachable}
                      existingExtract={ticket.llm_extract}
                      onExtract={(ex) => onUpdated({ id: ticket.id, llm_extract: ex })}
                      onSaveConfig={onSaveConfig}
                    />
                  </VStack>
                )}
              </TabPanel>

              {/* RECEIPT (Chainletter) */}
              <TabPanel px={0}>
                <CertifyPanel ticket={ticket} config={config} onCertified={onUpdated} />
              </TabPanel>
            </TabPanels>
          </Tabs>
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

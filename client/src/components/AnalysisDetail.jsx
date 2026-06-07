// Reusable rendering of a heuristic analysis (score breakdown, flags, AI
// indicators, component breakdown). Shared by the ticket drawer and the
// paste-and-analyze page. `analysis` is a ticket-shaped object:
// { score, score_band, breakdown:{metrics,flags,ai}, components, ai_suspicion, ai_disclosed, cliche_score }.
import {
  Box, Flex, HStack, VStack, Text, Badge, Heading, Divider, Wrap, WrapItem, Progress,
  SimpleGrid, Stat, StatLabel, StatNumber,
} from '@chakra-ui/react';
import { genreLabel, fmtWords, flagLabel, flagColor, metricLabel } from '../lib/format.js';

function MetricRow({ name, m }) {
  const pct = Math.round((m.value || 0) * 100);
  return (
    <Box>
      <Flex justify="space-between" fontSize="sm" mb={1}>
        <Text>{name}</Text>
        <Text color="gray.500">{pct}% · {m.points?.toFixed(1)} / {m.weight?.toFixed(0)} pts</Text>
      </Flex>
      <Progress value={pct} size="sm" borderRadius="full" colorScheme={pct >= 60 ? 'green' : pct >= 35 ? 'yellow' : 'red'} />
    </Box>
  );
}

function ComponentItem({ label, present, children }) {
  return (
    <Flex gap={3} align="start">
      <Badge colorScheme={present ? 'green' : 'gray'} mt={0.5}>{present ? '✓' : '—'}</Badge>
      <Box flex="1">
        <Text fontWeight="600" fontSize="sm">{label}</Text>
        {children}
      </Box>
    </Flex>
  );
}

export function ScoreSection({ analysis, meta, config }) {
  const bd = analysis.breakdown || {};
  const metrics = bd.metrics || {};
  const flags = bd.flags || [];
  const aiDetail = bd.ai || {};
  const sig = aiDetail.signals || {};
  const aiEnabled = config?.aiSuspicion?.enabled;

  return (
    <Box>
      <VStack align="stretch" spacing={3}>
        {Object.entries(metrics).map(([k, m]) => (
          <MetricRow key={k} name={metricLabel(meta, k)} m={m} />
        ))}
      </VStack>

      {flags.length > 0 && (
        <Box mt={5}>
          <Heading size="xs" mb={2}>Flags</Heading>
          <Wrap>
            {flags.map((f) => (
              <WrapItem key={f}><Badge variant="subtle" colorScheme={flagColor(f)}>{flagLabel(meta, f)}</Badge></WrapItem>
            ))}
          </Wrap>
        </Box>
      )}

      {aiEnabled && (
        <Box mt={6}>
          <Heading size="xs" mb={2}>Potential AI indicators</Heading>
          <Text fontSize="xs" color="gray.500" mb={2}>
            Heuristics flag patterns, not proof. Advisory only — they do not change the score.
          </Text>
          <Flex align="center" gap={3} mb={3}>
            <Badge colorScheme={analysis.ai_suspicion >= 60 ? 'pink' : 'gray'} fontSize="1em" px={2}>
              {analysis.ai_suspicion}/100
            </Badge>
            <Progress flex="1" value={analysis.ai_suspicion} size="sm" borderRadius="full" colorScheme="pink" />
          </Flex>
          <SimpleGrid columns={2} spacing={2} fontSize="xs" color="gray.600">
            <Text>Sentence-length variance: <b>{sig.burstiness ?? '—'}</b></Text>
            <Text>Type–token ratio: <b>{sig.typeTokenRatio ?? '—'}</b></Text>
            <Text>Em-dashes / 250w: <b>{sig.emDashPer250 ?? '—'}</b></Text>
            <Text>Contractions / 100w: <b>{sig.contractionsPer100 ?? '—'}</b></Text>
            <Text>AI-vocabulary hits: <b>{sig.aiPhraseMatches ?? '—'}</b></Text>
            <Text>Emotion words: <b>{sig.emotionMatches ?? '—'}</b></Text>
          </SimpleGrid>
          {aiDetail.matchedAiPhrases?.length > 0 && (
            <Wrap mt={2}>
              {aiDetail.matchedAiPhrases.map((p) => (
                <WrapItem key={p}><Badge variant="outline" colorScheme="pink" fontSize="0.65em">{p}</Badge></WrapItem>
              ))}
            </Wrap>
          )}
          <HStack mt={3} spacing={4}>
            <Stat size="sm"><StatLabel fontSize="xs">AI disclosed?</StatLabel><StatNumber fontSize="md">{analysis.ai_disclosed ? 'Yes' : 'No'}</StatNumber></Stat>
            <Stat size="sm"><StatLabel fontSize="xs">Cliché score</StatLabel><StatNumber fontSize="md">{analysis.cliche_score}/100</StatNumber></Stat>
          </HStack>
        </Box>
      )}
    </Box>
  );
}

export function ComponentsSection({ analysis, meta }) {
  const c = analysis.components || {};
  const md = c.metadata || {};
  return (
    <VStack align="stretch" spacing={4}>
      <ComponentItem label="Salutation / personalization" present={c.salutation?.present}>
        <Text fontSize="xs" color="gray.600">{c.salutation?.text}</Text>
        <HStack mt={1} fontSize="xs">
          {c.salutation?.agentNamePresent && <Badge colorScheme="green">Agent named</Badge>}
          {c.salutation?.personalized && <Badge colorScheme="green">Personalized</Badge>}
          {c.salutation?.massMail && <Badge colorScheme="red">Mass-mail</Badge>}
        </HStack>
      </ComponentItem>
      <ComponentItem label="Hook" present={c.hook?.present}>
        {c.hook?.text && <Text fontSize="xs" color="gray.600">{c.hook.text}</Text>}
      </ComponentItem>
      <ComponentItem label="Pitch structure" present={c.pitch?.present}>
        <HStack mt={1} fontSize="xs" flexWrap="wrap">
          <Badge colorScheme={c.pitch?.hasCharacter ? 'green' : 'gray'}>Character</Badge>
          <Badge colorScheme={c.pitch?.hasGoal ? 'green' : 'gray'}>Goal</Badge>
          <Badge colorScheme={c.pitch?.hasConflict ? 'green' : 'gray'}>Conflict</Badge>
          <Badge colorScheme={c.pitch?.hasStakes ? 'green' : 'gray'}>Stakes</Badge>
          {c.pitch?.spoiler && <Badge colorScheme="red">Spoiler</Badge>}
        </HStack>
      </ComponentItem>
      <ComponentItem label="Comp titles" present={c.comps?.present}>
        {c.comps?.present && (
          <Text fontSize="xs" color="gray.600">
            {[...(c.comps.titles || []), ...(c.comps.authors || [])].join(', ') || '(detected, none parsed)'}
            {c.comps.years?.length ? ` · years: ${c.comps.years.join(', ')}` : ''}
          </Text>
        )}
      </ComponentItem>
      <ComponentItem label="Metadata" present={c.metadata?.present}>
        <Text fontSize="xs" color="gray.600">
          {md.genreKey ? genreLabel(meta, md.genreKey) : 'genre unclear'} · {md.wordCount != null ? fmtWords(md.wordCount) : 'word count unknown'}
          {md.ageCategory ? ` · ${md.ageCategory.replace('_', ' ')}` : ''}
        </Text>
      </ComponentItem>
      <ComponentItem label="Author bio" present={c.bio?.present}>
        {c.bio?.present && <Text fontSize="xs" color="gray.600">{c.bio.relevant ? 'Relevant credentials detected' : 'Present (personal)'}</Text>}
      </ComponentItem>
      <ComponentItem label="Closing / contact" present={c.closing?.present}>
        {c.closing?.hasContact && <Text fontSize="xs" color="gray.600">Contact details present</Text>}
      </ComponentItem>
      <Divider />
      <Text fontSize="sm" color="gray.500">Component coverage: {Math.round((c.coverage || 0) * 100)}%</Text>
    </VStack>
  );
}

export default function AnalysisDetail({ analysis, meta, config }) {
  return (
    <VStack align="stretch" spacing={6}>
      <ScoreSection analysis={analysis} meta={meta} config={config} />
      <Divider />
      <Box>
        <Heading size="xs" mb={3}>Components</Heading>
        <ComponentsSection analysis={analysis} meta={meta} />
      </Box>
    </VStack>
  );
}

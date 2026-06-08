import { Box, Flex, Text, Badge, HStack, Wrap, WrapItem, Tooltip } from '@chakra-ui/react';
import { scoreColor, genreLabel, fmtWords, flagLabel, flagColor } from '../lib/format.js';

export default function TicketCard({ ticket, meta, config, onOpen }) {
  const c = ticket.components || {};
  const md = c.metadata || {};
  const title = md.title || ticket.subject || '(untitled)';
  const flags = (ticket.breakdown?.flags || []).filter((f) => !['wordcount_unknown'].includes(f));
  const topFlags = flags.slice(0, 2);
  const aiEnabled = config?.aiSuspicion?.enabled;
  const aiHigh = aiEnabled && ticket.ai_suspicion >= (config?.aiSuspicion?.thresholds?.suspicionFlagAt ?? 60);

  return (
    <Box
      bg="white"
      borderRadius="md"
      borderWidth="1px"
      borderColor="gray.200"
      p={2.5}
      cursor="pointer"
      _hover={{ borderColor: 'brand.300', shadow: 'sm' }}
      onClick={() => onOpen(ticket)}
    >
      <Flex align="start" gap={2}>
        <Badge
          colorScheme={scoreColor(ticket.score)}
          fontSize="0.9em"
          borderRadius="md"
          px={2}
          py={0.5}
          minW="34px"
          textAlign="center"
        >
          {ticket.score}
        </Badge>
        <Box flex="1" minW={0}>
          <Text fontWeight="600" fontSize="sm" noOfLines={1} title={title}>{title}</Text>
          <Text fontSize="xs" color="gray.500" noOfLines={1}>
            {ticket.from_name || ticket.from_addr || 'unknown sender'}
          </Text>
        </Box>
      </Flex>

      <Wrap spacing={1} mt={2}>
        {md.genreKey && (
          <WrapItem><Badge variant="subtle" colorScheme="blue">{genreLabel(meta, md.genreKey)}</Badge></WrapItem>
        )}
        {md.wordCount != null && (
          <WrapItem><Badge variant="subtle" colorScheme="gray">{fmtWords(md.wordCount)}</Badge></WrapItem>
        )}
        {ticket.ai_disclosed && (
          <WrapItem><Badge variant="subtle" colorScheme="purple">AI disclosed</Badge></WrapItem>
        )}
        <WrapItem>
          {ticket.cl_stamped ? (
            <Tooltip label="Receipt blockchain-stamped"><Badge colorScheme="green">⛓ Stamped</Badge></Tooltip>
          ) : (
            <Tooltip label="Not yet certified"><Badge variant="outline" colorScheme="gray">Not stamped</Badge></Tooltip>
          )}
        </WrapItem>
        {aiHigh && (
          <WrapItem>
            <Tooltip label={`AI-suspicion ${ticket.ai_suspicion}/100 — advisory only`}>
              <Badge variant="subtle" colorScheme="pink">AI? {ticket.ai_suspicion}</Badge>
            </Tooltip>
          </WrapItem>
        )}
      </Wrap>

      {topFlags.length > 0 && (
        <HStack mt={2} spacing={1} flexWrap="wrap">
          {topFlags.map((f) => (
            <Badge key={f} fontSize="0.65em" variant="outline" colorScheme={flagColor(f)}>
              {flagLabel(meta, f)}
            </Badge>
          ))}
          {flags.length > 2 && <Text fontSize="0.65em" color="gray.400">+{flags.length - 2}</Text>}
        </HStack>
      )}
    </Box>
  );
}

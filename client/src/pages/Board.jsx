import { useMemo, useState } from 'react';
import {
  Box, Flex, Grid, GridItem, HStack, Heading, Text, Badge, Input, InputGroup, InputLeftElement,
  IconButton, Button, Stack, Spacer, Select, Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react';
import { FiSearch, FiChevronDown, FiChevronRight, FiInbox, FiFolder, FiFilePlus, FiRefreshCw, FiArchive, FiXCircle } from 'react-icons/fi';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import TicketCard from '../components/TicketCard.jsx';
import { bandColor } from '../lib/format.js';

const CELL_CAP = 80;

export default function Board({ meta, config, tickets, staleCount = 0, busy, profiles = [], activeProfile = '', onSelectProfile, onStatus, onOpen, onScan, onShowFolder, onPaste, onRescore, onArchive, onArchiveRejected }) {
  const states = meta?.states || [];
  const bands = config?.scoreBands || [];
  const [query, setQuery] = useState('');
  // Default every swimlane collapsed — the full list is large; the agent expands
  // the band(s) they want. (A search query temporarily expands all, below.)
  const [collapsed, setCollapsed] = useState(() =>
    Object.fromEntries((config?.scoreBands || []).map((b) => [b.key, true]))
  );
  const allCollapsed = bands.length > 0 && bands.every((b) => collapsed[b.key]);
  const setAll = (val) => setCollapsed(Object.fromEntries(bands.map((b) => [b.key, val])));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tickets;
    return tickets.filter((t) => {
      const title = t.components?.metadata?.title || '';
      return (
        (t.subject || '').toLowerCase().includes(q) ||
        (t.from_name || '').toLowerCase().includes(q) ||
        (t.from_addr || '').toLowerCase().includes(q) ||
        title.toLowerCase().includes(q)
      );
    });
  }, [tickets, query]);

  // group[bandKey][statusKey] = sorted tickets
  const grouped = useMemo(() => {
    const g = {};
    for (const b of bands) {
      g[b.key] = {};
      for (const s of states) g[b.key][s.key] = [];
    }
    for (const t of filtered) {
      const bk = g[t.score_band] ? t.score_band : bands[bands.length - 1]?.key;
      if (!bk || !g[bk]) continue;
      const sk = g[bk][t.status] ? t.status : 'did_not_review';
      if (g[bk][sk]) g[bk][sk].push(t);
    }
    for (const b of bands) for (const s of states) g[b.key][s.key].sort((a, c) => c.score - a.score);
    return g;
  }, [filtered, bands, states]);

  const statusTotals = useMemo(() => {
    const totals = Object.fromEntries(states.map((s) => [s.key, 0]));
    for (const t of filtered) if (totals[t.status] != null) totals[t.status] += 1;
    return totals;
  }, [filtered, states]);

  // Count of all rejected cards (unaffected by search) — what "Archive Rejected" acts on.
  const rejectCount = useMemo(() => tickets.filter((t) => t.status === 'reject').length, [tickets]);

  const onDragEnd = (result) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const statusKey = destination.droppableId.split('::')[1];
    const id = Number(draggableId);
    const ticket = tickets.find((t) => t.id === id);
    if (ticket && ticket.status !== statusKey) onStatus(id, statusKey);
  };

  if (!tickets.length) {
    return (
      <Flex h="100%" align="center" justify="center" direction="column" gap={4} color="gray.500">
        <FiInbox size={48} />
        <Heading size="md">No queries on the board</Heading>
        <Text textAlign="center"><b>Drag <code>.eml</code> files anywhere onto this window</b> — or drop them in the input folder and scan.</Text>
        <HStack>
          <Button leftIcon={<FiInbox />} onClick={onScan}>Scan Inbox</Button>
          <Button leftIcon={<FiFilePlus />} variant="outline" colorScheme="gray" onClick={onPaste}>Paste a letter</Button>
          <Button leftIcon={<FiFolder />} variant="outline" colorScheme="gray" onClick={onShowFolder}>Where do files go?</Button>
        </HStack>
        <Button leftIcon={<FiArchive />} variant="ghost" colorScheme="gray" onClick={onArchive}>
          Archived items — view &amp; restore
        </Button>
      </Flex>
    );
  }

  const gridCols = `200px repeat(${states.length}, minmax(220px, 1fr))`;

  return (
    <Flex direction="column" h="100%">
      {/* Toolbar */}
      <Flex px={5} py={3} align="center" gap={2} bg="gray.50">
        {profiles.length > 0 && (
          <HStack spacing={1} flexShrink={0} mr={1}>
            <Text fontSize="sm" color="gray.600">Profile</Text>
            <Select
              size="sm" bg="white" borderRadius="md" maxW="200px"
              value={activeProfile}
              onChange={(e) => onSelectProfile?.(e.target.value)}
              isDisabled={busy}
              title="Switch scoring profile (re-scores the board)"
            >
              {profiles.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </HStack>
        )}
        <InputGroup maxW="300px" bg="white" borderRadius="md">
          <InputLeftElement pointerEvents="none"><FiSearch color="gray" /></InputLeftElement>
          <Input placeholder="Search title, author, subject…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </InputGroup>
        <Text color="gray.500" fontSize="sm" flexShrink={0}>{filtered.length} shown</Text>
        {staleCount > 0 && (
          <Badge colorScheme="orange" variant="subtle" px={2} py={1} borderRadius="md" flexShrink={0}>{staleCount} stale</Badge>
        )}
        <Spacer />
        <Button size="sm" variant="ghost" colorScheme="gray" leftIcon={<FiFilePlus />} onClick={onPaste}>Paste</Button>
        <Button size="sm" variant="ghost" colorScheme="gray" leftIcon={<FiRefreshCw />} onClick={onRescore} isLoading={busy}>Re-score</Button>
        <Menu>
          <MenuButton as={Button} size="sm" variant="ghost" colorScheme="gray" leftIcon={<FiArchive />} rightIcon={<FiChevronDown />}>
            Archive
          </MenuButton>
          <MenuList>
            <MenuItem icon={<FiArchive />} onClick={onArchive}>Archive board…</MenuItem>
            <MenuItem icon={<FiXCircle />} onClick={onArchiveRejected} isDisabled={!rejectCount}>
              Archive Rejected{rejectCount ? ` (${rejectCount})` : ''}
            </MenuItem>
          </MenuList>
        </Menu>
        <Button
          size="sm" variant="ghost" colorScheme="gray"
          leftIcon={allCollapsed ? <FiChevronDown /> : <FiChevronRight />}
          onClick={() => setAll(!allCollapsed)}
        >
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </Button>
      </Flex>

      <Box flex="1" overflow="auto" px={3} pb={6}>
        <DragDropContext onDragEnd={onDragEnd}>
          {/* Column header row (sticky) */}
          <Grid templateColumns={gridCols} gap={3} position="sticky" top={0} zIndex={2} bg="gray.50" py={2} px={1}>
            <GridItem />
            {states.map((s) => (
              <GridItem key={s.key}>
                <HStack justify="space-between" px={2}>
                  <Text fontWeight="700" fontSize="sm">{s.label}</Text>
                  <Badge colorScheme="gray">{statusTotals[s.key] || 0}</Badge>
                </HStack>
              </GridItem>
            ))}
          </Grid>

          {/* One swimlane per score band */}
          {bands.map((band) => {
            const isCollapsed = collapsed[band.key] && !query.trim();
            const bandCount = states.reduce((n, s) => n + (grouped[band.key]?.[s.key]?.length || 0), 0);
            return (
              <Box key={band.key} mb={2}>
                <Flex
                  align="center" gap={2} px={2} py={1} mt={2}
                  borderLeft="4px solid" borderColor={`${bandColor(band.key)}.400`}
                  bg={`${bandColor(band.key)}.50`} borderRadius="md"
                >
                  <IconButton
                    aria-label="toggle" size="xs" variant="ghost"
                    icon={isCollapsed ? <FiChevronRight /> : <FiChevronDown />}
                    onClick={() => setCollapsed((c) => ({ ...c, [band.key]: !c[band.key] }))}
                  />
                  <Heading size="xs">{band.label}</Heading>
                  <Text fontSize="xs" color="gray.500">({band.min}–{band.max})</Text>
                  <Badge colorScheme={bandColor(band.key)}>{bandCount}</Badge>
                </Flex>

                {!isCollapsed && (
                  <Grid templateColumns={gridCols} gap={3} px={1} mt={2}>
                    <GridItem /> {/* spacer under the band label column */}
                    {states.map((s) => {
                      const cards = grouped[band.key]?.[s.key] || [];
                      const shown = cards.slice(0, CELL_CAP);
                      return (
                        <GridItem key={s.key}>
                          <Droppable droppableId={`${band.key}::${s.key}`}>
                            {(provided, snapshot) => (
                              <Stack
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                spacing={2}
                                minH="60px"
                                p={2}
                                borderRadius="md"
                                bg={snapshot.isDraggingOver ? `${bandColor(band.key)}.100` : 'blackAlpha.50'}
                                transition="background 0.15s"
                              >
                                {shown.map((t, idx) => (
                                  <Draggable key={t.id} draggableId={String(t.id)} index={idx}>
                                    {(dp, ds) => (
                                      <Box
                                        ref={dp.innerRef}
                                        {...dp.draggableProps}
                                        {...dp.dragHandleProps}
                                        style={dp.draggableProps.style}
                                        opacity={ds.isDragging ? 0.9 : 1}
                                      >
                                        <TicketCard ticket={t} meta={meta} config={config} onOpen={onOpen} />
                                      </Box>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                                {cards.length > CELL_CAP && (
                                  <Text fontSize="xs" color="gray.500" textAlign="center">
                                    +{cards.length - CELL_CAP} more — use search to narrow
                                  </Text>
                                )}
                              </Stack>
                            )}
                          </Droppable>
                        </GridItem>
                      );
                    })}
                  </Grid>
                )}
              </Box>
            );
          })}
        </DragDropContext>
      </Box>
    </Flex>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box, Flex, HStack, VStack, Button, Heading, Text, Spinner, useToast, useDisclosure, Badge, Spacer,
  Menu, MenuButton, MenuList, MenuItem,
} from '@chakra-ui/react';
import { FiGrid, FiSliders, FiCpu, FiSettings, FiChevronDown } from 'react-icons/fi';
import ClGlyph from './components/ClGlyph.jsx';
import api, { setOnUnauthorized, getAuth } from './api.js';
import Login from './components/Login.jsx';
import AccountMenu from './components/AccountMenu.jsx';
import ArchiveModal from './components/ArchiveModal.jsx';
import Board from './pages/Board.jsx';
import PastePage from './pages/PastePage.jsx';
import ConfigForm from './components/ConfigForm.jsx';
import LlmPanel from './components/LlmPanel.jsx';
import ChainletterPanel from './components/ChainletterPanel.jsx';
import TicketDrawer from './components/TicketDrawer.jsx';
import InboxModal from './components/InboxModal.jsx';
import Footer from './components/Footer.jsx';
import Logo from './components/Logo.jsx';

function NavButton({ icon, label, active, onClick }) {
  return (
    <Button
      leftIcon={icon}
      variant={active ? 'solid' : 'ghost'}
      colorScheme={active ? 'brand' : 'gray'}
      onClick={onClick}
      size="sm"
    >
      {label}
    </Button>
  );
}

export default function App() {
  const toast = useToast();
  const [view, setView] = useState('board');
  const [meta, setMeta] = useState(null);
  const [config, setConfig] = useState(null);
  const [serverHash, setServerHash] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slow, setSlow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [dragging, setDragging] = useState(false);
  const drawer = useDisclosure();
  const inboxModal = useDisclosure();
  const archiveModal = useDisclosure();

  const loadTickets = useCallback(async () => {
    const { tickets: t, configHash } = await api.tickets();
    setTickets(t);
    setServerHash(configHash);
  }, []);

  // On first load, restore the session from stored credentials.
  useEffect(() => {
    setOnUnauthorized(() => setUser(null));
    if (getAuth()) {
      api.me().then(({ user: u }) => setUser(u)).catch(() => setUser(null)).finally(() => setAuthChecked(true));
    } else {
      setAuthChecked(true);
    }
  }, []);

  // Load app data once a user is authenticated.
  useEffect(() => {
    if (!user) return undefined;
    setLoading(true);
    const slowTimer = setTimeout(() => setSlow(true), 6000);
    (async () => {
      try {
        const [m, c] = await Promise.all([api.meta(), api.getConfig()]);
        setMeta(m);
        setConfig(c.config);
        await loadTickets();
      } catch (err) {
        toast({ title: 'Failed to load', description: err.message, status: 'error' });
      } finally {
        clearTimeout(slowTimer);
        setLoading(false);
      }
    })();
    return () => clearTimeout(slowTimer);
  }, [user, loadTickets, toast]);

  // Live updates: the server pushes an event when the folder watcher (or an
  // upload) changes the ticket list, so the board refreshes on its own.
  // Live updates via lightweight polling of a revision counter — no persistent
  // connection, so multiple open tabs can never exhaust the browser's per-host
  // connection limit (which a long-lived SSE stream would).
  useEffect(() => {
    if (loading || !user) return undefined;
    let lastRev = null;
    const tick = async () => {
      if (document.hidden) return; // don't poll background tabs
      try {
        const { rev } = await api.revision();
        if (lastRev !== null && rev !== lastRev) loadTickets();
        lastRev = rev;
      } catch {
        /* transient — try again next tick */
      }
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [loading, user, loadTickets]);

  const handleFileDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = [...(e.dataTransfer?.files || [])];
    const emls = dropped.filter((f) => f.name.toLowerCase().endsWith('.eml'));
    if (!emls.length) {
      toast({ title: 'Only .eml files', description: 'Export emails as .eml first — see “Inbox folder”.', status: 'warning' });
      return;
    }
    try {
      const readFile = (file) =>
        new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve({ name: file.name, content: fr.result });
          fr.onerror = reject;
          fr.readAsText(file);
        });
      const contents = await Promise.all(emls.map(readFile));
      const out = await api.upload(contents);
      await loadTickets();
      toast({ title: 'Files added', description: `${out.written} saved — ${out.added} new, ${out.updated} updated.`, status: 'success' });
    } catch (err) {
      toast({ title: 'Upload failed', description: err.message, status: 'error' });
    }
  };

  const scanInbox = async () => {
    setBusy(true);
    try {
      const out = await api.scan();
      await loadTickets();
      const archived = out.archived ? ` Archived ${out.archived.count} to ${out.archived.zip}.` : '';
      toast({
        title: 'Inbox scanned',
        description: out.error
          ? out.error
          : `${out.scanned} files — ${out.added} new, ${out.updated} updated${out.errors?.length ? `, ${out.errors.length} errors` : ''}.${archived}`,
        status: out.error ? 'warning' : 'success',
      });
    } catch (err) {
      toast({ title: 'Scan failed', description: err.message, status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const rescoreAll = async () => {
    setBusy(true);
    try {
      const out = await api.rescore();
      await loadTickets();
      toast({ title: 'Re-scored', description: `${out.rescored} tickets re-scored.`, status: 'success' });
    } catch (err) {
      toast({ title: 'Re-score failed', description: err.message, status: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const updateStatus = useCallback(async (id, status) => {
    // optimistic
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status } : t)));
    try {
      await api.setStatus(id, status);
    } catch (err) {
      toast({ title: 'Could not move card', description: err.message, status: 'error' });
      loadTickets();
    }
  }, [loadTickets, toast]);

  const saveConfig = async (next, opts = {}) => {
    if (!opts.silent) setBusy(true);
    try {
      const out = await api.saveConfig(next);
      setConfig(out.config);
      if (!opts.silent) toast({ title: 'Configuration saved', status: 'success' });
      return out;
    } catch (err) {
      toast({ title: 'Save failed', description: err.message, status: 'error' });
      throw err;
    } finally {
      if (!opts.silent) setBusy(false);
    }
  };

  const openTicket = useCallback((t) => {
    setSelected(t);
    drawer.onOpen();
  }, [drawer]);

  const onTicketUpdated = useCallback((updated) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    setSelected((s) => (s && s.id === updated.id ? { ...s, ...updated } : s));
  }, []);

  const onTicketAdded = useCallback((ticket) => {
    setTickets((prev) => [ticket, ...prev]);
    setView('board');
  }, []);

  const staleCount = useMemo(
    () => (serverHash ? tickets.filter((t) => t.config_hash && t.config_hash !== serverHash).length : 0),
    [tickets, serverHash]
  );

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setView('board');
  };

  if (!authChecked) {
    return (
      <Flex h="100vh" align="center" justify="center">
        <Spinner size="xl" color="brand.500" thickness="4px" />
      </Flex>
    );
  }
  if (!user) {
    return <Login onAuthed={(u) => setUser(u)} />;
  }

  if (loading) {
    return (
      <Flex h="100vh" align="center" justify="center" direction="column" gap={4}>
        <Spinner size="xl" color="brand.500" thickness="4px" />
        <Text color="gray.500">Loading QueryQuery…</Text>
        {slow && (
          <VStack spacing={2} maxW="380px" textAlign="center">
            <Text fontSize="sm" color="gray.500">
              Taking longer than usual. If you have other QueryQuery tabs open, close them — the browser limits
              connections per site and the live-update stream can use them up.
            </Text>
            <Button size="sm" onClick={() => window.location.reload()}>Refresh</Button>
          </VStack>
        )}
      </Flex>
    );
  }

  return (
    <Flex
      direction="column"
      h="100vh"
      overflow="hidden"
      onDragOver={(e) => { e.preventDefault(); if (!dragging) setDragging(true); }}
    >
      <Flex as="header" align="center" px={5} py={3} bg="white" borderBottom="1px solid" borderColor="gray.200" gap={4}>
        <HStack spacing={2} flexShrink={0}>
          <Logo />
          <Badge colorScheme="gray">{tickets.length}</Badge>
        </HStack>
        <HStack spacing={1} ml={6}>
          <NavButton icon={<FiGrid />} label="Board" active={view === 'board'} onClick={() => setView('board')} />
          <Menu>
            <MenuButton
              as={Button}
              size="sm"
              leftIcon={<FiSettings />}
              rightIcon={<FiChevronDown />}
              variant={['config', 'settings', 'chainletter'].includes(view) ? 'solid' : 'ghost'}
              colorScheme={['config', 'settings', 'chainletter'].includes(view) ? 'brand' : 'gray'}
            >
              Settings
            </MenuButton>
            <MenuList>
              <MenuItem icon={<FiSliders />} onClick={() => setView('config')}>Configuration</MenuItem>
              {user.role === 'admin' && <MenuItem icon={<FiCpu />} onClick={() => setView('settings')}>Local LLM</MenuItem>}
              <MenuItem icon={<ClGlyph />} onClick={() => setView('chainletter')}>Chainletter</MenuItem>
            </MenuList>
          </Menu>
        </HStack>
        <Spacer />
        <AccountMenu user={user} onLogout={handleLogout} onShowInbox={inboxModal.onOpen} />
      </Flex>

      <Box flex="1" overflow="hidden">
        {view === 'board' && (
          <Board
            meta={meta}
            config={config}
            tickets={tickets}
            staleCount={staleCount}
            busy={busy}
            onStatus={updateStatus}
            onOpen={openTicket}
            onScan={scanInbox}
            onShowFolder={inboxModal.onOpen}
            onPaste={() => setView('paste')}
            onRescore={rescoreAll}
            onArchive={archiveModal.onOpen}
          />
        )}
        {view === 'paste' && (
          <Box h="100%" overflowY="auto" p={6}>
            <PastePage meta={meta} config={config} onAdded={onTicketAdded} onSaveConfig={saveConfig} />
          </Box>
        )}
        {view === 'config' && (
          <Box h="100%" overflowY="auto" p={6}>
            <ConfigForm meta={meta} config={config} onSave={saveConfig} onRescore={rescoreAll} busy={busy} />
          </Box>
        )}
        {view === 'settings' && (
          <Box h="100%" overflowY="auto" p={6}>
            <LlmPanel />
          </Box>
        )}
        {view === 'chainletter' && (
          <Box h="100%" overflowY="auto" p={6}>
            <ChainletterPanel />
          </Box>
        )}
      </Box>

      <Footer />

      <TicketDrawer
        isOpen={drawer.isOpen}
        onClose={drawer.onClose}
        ticket={selected}
        meta={meta}
        config={config}
        onStatus={updateStatus}
        onUpdated={onTicketUpdated}
        onSaveConfig={saveConfig}
      />

      <InboxModal isOpen={inboxModal.isOpen} onClose={inboxModal.onClose} onScan={scanInbox} />

      <ArchiveModal isOpen={archiveModal.isOpen} onClose={archiveModal.onClose} activeCount={tickets.length} onChanged={loadTickets} />

      {dragging && (
        <Flex
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex={2000}
          bg="blackAlpha.600"
          align="center"
          justify="center"
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={() => setDragging(false)}
          onDrop={handleFileDrop}
        >
          <Box bg="white" borderRadius="xl" borderWidth="2px" borderStyle="dashed" borderColor="brand.400" px={12} py={10} textAlign="center" pointerEvents="none">
            <Box fontSize="3xl" mb={2}>📥</Box>
            <Heading size="md">Drop .eml files to add</Heading>
            <Text color="gray.500" mt={1}>They’ll be saved to your input folder and scored automatically.</Text>
          </Box>
        </Flex>
      )}
    </Flex>
  );
}

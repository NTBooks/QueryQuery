import { useEffect, useState } from 'react';
import {
  Menu, MenuButton, MenuList, MenuItem, MenuDivider, Button, Badge, HStack, Text,
  Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton, ModalBody, ModalFooter,
  FormControl, FormLabel, FormHelperText, Input, VStack, useDisclosure, useToast, Alert, AlertIcon,
  Table, Thead, Tbody, Tr, Th, Td, IconButton, Spinner,
} from '@chakra-ui/react';
import { FiUser, FiChevronDown, FiKey, FiUsers, FiLogOut, FiFolder } from 'react-icons/fi';
import api from '../api.js';

// Mirror of server/passwordPolicy.js PASSWORD_MIN_LENGTH (keep in sync).
const PW_MIN = 12;

function ChangePasswordModal({ isOpen, onClose }) {
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await api.changePassword(cur, next);
      toast({ title: 'Password changed', status: 'success' });
      setCur('');
      setNext('');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Change password</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={3} align="stretch">
            {err && <Alert status="error" borderRadius="md" fontSize="sm" py={2}><AlertIcon />{err}</Alert>}
            <FormControl isRequired><FormLabel>Current password</FormLabel><Input type="password" value={cur} onChange={(e) => setCur(e.target.value)} /></FormControl>
            <FormControl isRequired>
              <FormLabel>New password</FormLabel>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} />
              <FormHelperText>At least {PW_MIN} characters.</FormHelperText>
            </FormControl>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
          <Button colorScheme="brand" onClick={submit} isLoading={busy} isDisabled={!cur || next.length < PW_MIN}>Change</Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function UsersModal({ isOpen, onClose, meId }) {
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [pw, setPw] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setUsers(null);
    setResetting(null);
    setPw('');
    api.listUsers()
      .then(({ users: u }) => setUsers(u))
      .catch((e) => { toast({ title: 'Failed to load users', description: e.message, status: 'error' }); setUsers([]); });
  }, [isOpen, toast]);

  const doReset = async (id) => {
    try {
      await api.resetPassword(id, pw);
      toast({ title: 'Password reset', status: 'success' });
      setResetting(null);
      setPw('');
    } catch (e) {
      toast({ title: 'Reset failed', description: e.message, status: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" isCentered>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Users</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          {users === null ? (
            <HStack color="gray.500"><Spinner size="sm" /><Text>Loading…</Text></HStack>
          ) : (
            <Table size="sm">
              <Thead><Tr><Th>Username</Th><Th>Role</Th><Th /></Tr></Thead>
              <Tbody>
                {users.map((u) => (
                  <Tr key={u.id}>
                    <Td>{u.username}{u.id === meId && <Badge ml={2} colorScheme="purple">you</Badge>}</Td>
                    <Td><Badge colorScheme={u.role === 'admin' ? 'orange' : 'gray'}>{u.role}</Badge></Td>
                    <Td textAlign="right">
                      {resetting === u.id ? (
                        <HStack justify="flex-end">
                          <Input size="xs" w="160px" type="password" placeholder={`new password (${PW_MIN}+ chars)`} value={pw} onChange={(e) => setPw(e.target.value)} />
                          <Button size="xs" colorScheme="brand" onClick={() => doReset(u.id)} isDisabled={pw.length < PW_MIN}>Set</Button>
                          <IconButton aria-label="cancel" size="xs" variant="ghost" icon={<Text>×</Text>} onClick={() => { setResetting(null); setPw(''); }} />
                        </HStack>
                      ) : (
                        <Button size="xs" leftIcon={<FiKey />} variant="outline" onClick={() => { setResetting(u.id); setPw(''); }}>Reset password</Button>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default function AccountMenu({ user, onLogout, onShowInbox }) {
  const pw = useDisclosure();
  const users = useDisclosure();
  return (
    <>
      <Menu>
        <MenuButton as={Button} size="sm" variant="ghost" leftIcon={<FiUser />} rightIcon={<FiChevronDown />}>
          <HStack spacing={2}>
            <Text>{user.username}</Text>
            {user.role === 'admin' && <Badge colorScheme="orange">admin</Badge>}
          </HStack>
        </MenuButton>
        <MenuList>
          {onShowInbox && <MenuItem icon={<FiFolder />} onClick={onShowInbox}>Inbox folder</MenuItem>}
          <MenuItem icon={<FiKey />} onClick={pw.onOpen}>Change password</MenuItem>
          {user.role === 'admin' && <MenuItem icon={<FiUsers />} onClick={users.onOpen}>Manage users</MenuItem>}
          <MenuDivider />
          <MenuItem icon={<FiLogOut />} onClick={onLogout}>Sign out</MenuItem>
        </MenuList>
      </Menu>
      <ChangePasswordModal isOpen={pw.isOpen} onClose={pw.onClose} />
      <UsersModal isOpen={users.isOpen} onClose={users.onClose} meId={user.id} />
    </>
  );
}

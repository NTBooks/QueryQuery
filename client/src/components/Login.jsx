import { useState } from 'react';
import {
  Flex, Box, VStack, Heading, Text, FormControl, FormLabel, Input, Button, Alert, AlertIcon, Link as CLink,
} from '@chakra-ui/react';
import api from '../api.js';
import Logo from './Logo.jsx';

export default function Login({ onAuthed }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = mode === 'login' ? await api.login(username.trim(), password) : await api.register(username.trim(), password);
      onAuthed(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Flex h="100vh" align="center" justify="center" bg="gray.50">
      <Box bg="white" borderWidth="1px" borderColor="gray.200" borderRadius="xl" p={8} w="full" maxW="380px" boxShadow="sm">
        <VStack spacing={5} align="stretch">
          <Flex justify="center"><Logo /></Flex>
          <Heading size="md" textAlign="center">{mode === 'login' ? 'Sign in' : 'Create an account'}</Heading>

          {error && (
            <Alert status="error" borderRadius="md" fontSize="sm" py={2}><AlertIcon />{error}</Alert>
          )}

          <form onSubmit={submit}>
            <VStack spacing={4} align="stretch">
              <FormControl isRequired>
                <FormLabel>Username</FormLabel>
                <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Password</FormLabel>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
              </FormControl>
              <Button type="submit" colorScheme="brand" isLoading={busy}>
                {mode === 'login' ? 'Sign in' : 'Register'}
              </Button>
            </VStack>
          </form>

          <Text fontSize="sm" color="gray.500" textAlign="center">
            {mode === 'login' ? (
              <>No account? <CLink color="brand.600" onClick={() => { setMode('register'); setError(''); }}>Register</CLink></>
            ) : (
              <>Have an account? <CLink color="brand.600" onClick={() => { setMode('login'); setError(''); }}>Sign in</CLink></>
            )}
          </Text>
          {mode === 'login' && (
            <Text fontSize="xs" color="gray.400" textAlign="center">First run? Sign in with <b>admin</b> / <b>admin</b>.</Text>
          )}
        </VStack>
      </Box>
    </Flex>
  );
}

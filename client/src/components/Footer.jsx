import { Flex, Text, Link, Image } from '@chakra-ui/react';

export default function Footer() {
  return (
    <Flex
      as="footer"
      align="center"
      justify="center"
      gap={2}
      py={2}
      bg="gray.900"
      color="gray.300"
      fontSize="sm"
      flexShrink={0}
    >
      <Text>Powered by</Text>
      <Link href="https://chainletterlabs.com" isExternal display="inline-flex" alignItems="center" aria-label="Chain Letter Labs">
        <Image src="/chainletter-logo.png" alt="Chain Letter Labs" h="36px" />
      </Link>
    </Flex>
  );
}

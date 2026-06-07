import { useState } from 'react';
import { Box, Heading, Image, HStack } from '@chakra-ui/react';

// QueryQuery brand: the QQ mark + wordmark. Falls back to a gradient square if
// the cropped mark image is missing, so the header never breaks.
export default function Logo() {
  const [failed, setFailed] = useState(false);
  return (
    <HStack spacing={2} flexShrink={0}>
      {failed ? (
        <Box boxSize="28px" bgGradient="linear(to-br, brand.400, brand.600)" borderRadius="md" />
      ) : (
        <Image src="/queryquery-mark.png" alt="QueryQuery" h="30px" w="auto" flexShrink={0} onError={() => setFailed(true)} />
      )}
      <Heading size="md" letterSpacing="-0.02em" whiteSpace="nowrap">QueryQuery</Heading>
    </HStack>
  );
}

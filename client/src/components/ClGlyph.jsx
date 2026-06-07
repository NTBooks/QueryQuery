import { Image } from '@chakra-ui/react';

// The Chainletter brand glyph, sized to sit inline as a button/nav icon.
export default function ClGlyph(props) {
  return <Image src="/chainletter-glyph.svg" alt="" h="1em" w="auto" display="inline-block" {...props} />;
}

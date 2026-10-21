import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, minimumScaleFactor, monospacedDigit } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/** What the app sends to the home-screen widget; all text is formatted in the app. */
export type FxWidgetProps = {
  usd: string;
  eur: string;
  /** Change over the last 30 days, e.g. "+2,84%". */
  usdMonth: string;
  eurMonth: string;
  usdUp: boolean;
  eurUp: boolean;
  /** Gram gold in TL, when the gold page has loaded. */
  gold: string | null;
  /** Best option in the 1-year trend scenario, e.g. "TL'de faizde tut". */
  advice: string | null;
  /** "21.10 14:05" */
  updated: string;
};

/**
 * Runs inside the widget extension, not in the app: the 'widget' directive turns the
 * function into source text, so it can use only its arguments and the SwiftUI globals.
 */
const FxWidget = (props: FxWidgetProps, env: WidgetEnvironment) => {
  'widget';
  'use no memo'; // keep React Compiler out: the widget runtime has no memo cache
  const dark = env.colorScheme === 'dark';
  const label = dark ? '#FFFFFF' : '#000000';
  const muted = dark ? '#AEAEB2' : '#6C6C70';
  // TL losing value against the currency is red, gaining is green.
  const upColor = dark ? '#F2948D' : '#B3261E';
  const downColor = dark ? '#6FD39A' : '#0A7A3D';
  const bg = [containerBackground(dark ? '#1C1C1E' : '#FFFFFF', 'widget')];

  if (!props || !props.usd) {
    return (
      <VStack modifiers={bg}>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(muted)]}>Kurları görmek için Finans uygulamasını açın.</Text>
      </VStack>
    );
  }

  if (env.widgetFamily === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit()]}>{`$ ${props.usd}  ${props.usdMonth}`}</Text>
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit()]}>{`€ ${props.eur}  ${props.eurMonth}`}</Text>
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{props.advice ?? props.updated}</Text>
      </VStack>
    );
  }

  const rate = (name: string, value: string, month: string, up: boolean) => (
    <VStack alignment="leading" spacing={0}>
      <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>{name}</Text>
      <Text modifiers={[font({ size: 24, weight: 'bold', design: 'rounded' }), monospacedDigit(), minimumScaleFactor(0.6), lineLimit(1), foregroundStyle(label)]}>
        {value}
      </Text>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), monospacedDigit(), foregroundStyle(up ? upColor : downColor)]}>{`${month} · 30 gün`}</Text>
    </VStack>
  );

  if (env.widgetFamily === 'systemMedium') {
    return (
      <VStack alignment="leading" spacing={6} modifiers={bg}>
        <HStack spacing={12}>
          {rate('DOLAR', props.usd, props.usdMonth, props.usdUp)}
          {rate('EURO', props.eur, props.eurMonth, props.eurUp)}
          {props.gold ? (
            <VStack alignment="leading" spacing={0}>
              <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(muted)]}>GRAM ALTIN</Text>
              <Text modifiers={[font({ size: 24, weight: 'bold', design: 'rounded' }), monospacedDigit(), minimumScaleFactor(0.6), lineLimit(1), foregroundStyle(label)]}>
                {props.gold}
              </Text>
              <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>TL</Text>
            </VStack>
          ) : null}
        </HStack>
        <Spacer />
        <HStack>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(downColor), lineLimit(1)]}>{props.advice ? `Öneri: ${props.advice}` : ''}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 11 }), foregroundStyle(muted)]}>{props.updated}</Text>
        </HStack>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={6} modifiers={bg}>
      {rate('DOLAR', props.usd, props.usdMonth, props.usdUp)}
      {rate('EURO', props.eur, props.eurMonth, props.eurUp)}
      <Spacer />
      <Text modifiers={[font({ size: 10 }), foregroundStyle(muted)]}>{props.updated}</Text>
    </VStack>
  );
};

export const fxWidget = createWidget<FxWidgetProps>('FxWidget', FxWidget);

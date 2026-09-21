import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors } from '@/constants/theme';
import {
  isGooglePlacesConfigured,
  loadGoogleAddress,
  searchGoogleAddresses,
  type AddressPlace,
  type AddressSuggestion,
} from '@/lib/googlePlaces';

type Props = {
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (value: string) => void;
  onSelect: (place: AddressPlace) => void;
  onUseCurrentLocation?: () => void;
  currentLocationLoading?: boolean;
  latitudeBias?: number | null;
  longitudeBias?: number | null;
};

export function AddressSearchField({
  label,
  value,
  placeholder,
  onChangeText,
  onSelect,
  onUseCurrentLocation,
  currentLocationLoading = false,
  latitudeBias = null,
  longitudeBias = null,
}: Props) {
  const requestRef = useRef(0);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const query = value.trim();

    if (!focused || query.length < 3 || !isGooglePlacesConfigured()) {
      setSuggestions([]);
      setSearching(false);
      return;
    }

    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    const timeout = setTimeout(() => {
      setSearching(true);

      searchGoogleAddresses(query, {
        latitude: latitudeBias,
        longitude: longitudeBias,
      })
        .then((rows) => {
          if (requestRef.current === requestId) setSuggestions(rows);
        })
        .catch(() => {
          if (requestRef.current === requestId) setSuggestions([]);
        })
        .finally(() => {
          if (requestRef.current === requestId) setSearching(false);
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [focused, latitudeBias, longitudeBias, value]);

  async function selectSuggestion(suggestion: AddressSuggestion) {
    setSelectingId(suggestion.placeId);

    try {
      const place = await loadGoogleAddress(suggestion.placeId);
      onChangeText(place.formattedAddress || suggestion.text);
      onSelect(place);
      setSuggestions([]);
      setFocused(false);
    } finally {
      setSelectingId(null);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {onUseCurrentLocation ? (
          <Pressable
            disabled={currentLocationLoading}
            onPress={onUseCurrentLocation}
            style={({ pressed }) => [
              styles.locationButton,
              (pressed || currentLocationLoading) && { opacity: 0.65 },
            ]}
          >
            {currentLocationLoading ? (
              <ActivityIndicator size="small" color={colors.coral} />
            ) : (
              <>
                <Text style={styles.locationIcon}>⌖</Text>
                <Text style={styles.locationText}>Use my location</Text>
              </>
            )}
          </Pressable>
        ) : null}
      </View>

      <View style={[styles.inputWrap, focused && styles.inputWrapFocused]}>
        <Text style={styles.pin}>⌖</Text>
        <TextInput
          value={value}
          onChangeText={(text) => {
            onChangeText(text);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setTimeout(() => setFocused(false), 180);
          }}
          placeholder={placeholder}
          placeholderTextColor="#A1A39C"
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="search"
        />
        {searching ? <ActivityIndicator size="small" color={colors.coral} /> : null}
      </View>

      {focused && suggestions.length ? (
        <View style={styles.suggestions}>
          {suggestions.map((suggestion, index) => (
            <Pressable
              key={suggestion.placeId}
              disabled={Boolean(selectingId)}
              onPress={() => void selectSuggestion(suggestion)}
              style={[
                styles.suggestion,
                index < suggestions.length - 1 && styles.suggestionBorder,
              ]}
            >
              <View style={styles.suggestionPin}><Text style={styles.suggestionPinText}>⌖</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mainText}>{suggestion.mainText}</Text>
                {suggestion.secondaryText ? (
                  <Text style={styles.secondaryText}>{suggestion.secondaryText}</Text>
                ) : null}
              </View>
              {selectingId === suggestion.placeId ? (
                <ActivityIndicator size="small" color={colors.coral} />
              ) : (
                <Text style={styles.arrow}>›</Text>
              )}
            </Pressable>
          ))}
          <Text style={styles.googleAttribution}>Google Maps</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 7 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  label: { color: colors.ink, fontSize: 11, fontWeight: '900' },
  locationButton: { minHeight: 32, borderRadius: 10, backgroundColor: colors.limeSoft, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  locationIcon: { color: colors.ink, fontSize: 13, fontWeight: '950' },
  locationText: { color: colors.ink, fontSize: 8.5, fontWeight: '950' },
  inputWrap: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FAF9F5', paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 7 },
  inputWrapFocused: { borderColor: colors.coral },
  pin: { color: colors.muted, fontSize: 16, fontWeight: '900' },
  input: { flex: 1, minHeight: 48, color: colors.ink, fontSize: 12.5 },
  suggestions: { borderRadius: 15, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },
  suggestion: { minHeight: 58, paddingHorizontal: 11, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 9 },
  suggestionBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  suggestionPin: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#F0EEE7', alignItems: 'center', justifyContent: 'center' },
  suggestionPinText: { color: colors.ink, fontSize: 13, fontWeight: '950' },
  mainText: { color: colors.ink, fontSize: 10.5, fontWeight: '900' },
  secondaryText: { color: colors.muted, fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  arrow: { color: '#A3A59E', fontSize: 22 },
  googleAttribution: { color: '#8E918A', fontSize: 7.5, textAlign: 'right', paddingHorizontal: 10, paddingVertical: 7 },
});

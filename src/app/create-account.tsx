import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  continueWithEmail,
  continueWithPrototypeProvider,
  type AccountMode,
  type PrototypeAuthMethod,
} from "@/src/services/auth";

const mascot = require("../assets/mascot/mascot.png");
const loadingRoute = "/loading" as Href;

const authMethods = [
  { id: "google", label: "Continue with Google", mark: "G" },
  { id: "apple", label: "Continue with Apple", mark: "A" },
  { id: "phone", label: "Continue with phone", mark: "#" },
];

export default function CreateAccountScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const initialMode = params.mode === "login" ? "login" : "create";
  const [mode, setMode] = useState<AccountMode>(initialMode);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const copy = useMemo(
    () =>
      mode === "create"
        ? {
            title: "Create your account",
            subtitle: "This prototype will continue to profile setup after account creation.",
            primary: "Create with email",
          }
        : {
            title: "Log in to MODU",
            subtitle: "This prototype will continue to profile setup after login.",
            primary: "Log in with email",
          },
    [mode],
  );

  const continueFlow = async (method: "email" | PrototypeAuthMethod) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    setErrorMessage(null);
    try {
      if (method === "email") {
        await continueWithEmail(email, mode);
        setStatus("Supabase email link requested. Continuing prototype flow.");
      } else {
        await continueWithPrototypeProvider(method);
        setStatus("Prototype provider selected. OAuth setup can be connected later.");
      }
      router.push(loadingRoute);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not continue. Please try again.";
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.panel}>
        <View style={styles.intro}>
          <Image source={mascot} style={styles.mascot} />
          <View style={styles.copy}>
            <Text style={styles.brand}>MODU</Text>
            <Text style={styles.title}>{copy.title}</Text>
            <Text style={styles.subtitle}>{copy.subtitle}</Text>
          </View>
        </View>

        <View style={styles.form}>
          <View style={styles.segmented}>
            <Pressable
              onPress={() => setMode("create")}
              style={[styles.segment, mode === "create" && styles.activeSegment]}
            >
              <Text style={[styles.segmentText, mode === "create" && styles.activeSegmentText]}>Create</Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("login")}
              style={[styles.segment, mode === "login" && styles.activeSegment]}
            >
              <Text style={[styles.segmentText, mode === "login" && styles.activeSegmentText]}>Log in</Text>
            </Pressable>
          </View>

          <View style={styles.emailGroup}>
            <TextInput
              autoCapitalize="none"
              inputMode="email"
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor="#9a8f80"
              style={styles.input}
              value={email}
            />
            <Pressable onPress={() => continueFlow("email")} style={[styles.primaryButton, busy && styles.disabledButton]}>
              <Text style={styles.primaryButtonText}>{busy ? "Connecting..." : copy.primary}</Text>
            </Pressable>
            {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
            {status ? <Text style={styles.statusText}>{status}</Text> : null}
          </View>

          <View style={styles.dividerRow}>
            <View style={styles.divider} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.divider} />
          </View>

          <View style={styles.methodList}>
            {authMethods.map((method) => (
              <Pressable
                key={method.id}
                onPress={() => continueFlow(method.id as PrototypeAuthMethod)}
                style={[styles.methodButton, busy && styles.disabledButton]}
              >
                <View style={styles.methodMark}>
                  <Text style={styles.methodMarkText}>{method.mark}</Text>
                </View>
                <Text style={styles.methodText}>{method.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.prototypeNote}>Prototype placeholder: account verification is mocked for the demo.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fffaf0",
    paddingHorizontal: 42,
    paddingVertical: 20,
  },
  panel: {
    width: "100%",
    maxWidth: 980,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 36,
  },
  intro: {
    flex: 1,
    maxWidth: 470,
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  mascot: {
    width: 92,
    height: 92,
    borderRadius: 22,
  },
  copy: {
    flex: 1,
    gap: 8,
  },
  brand: {
    color: "#b9a486",
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: 7,
  },
  title: {
    color: "#26231f",
    fontSize: 30,
    fontWeight: "900",
    lineHeight: 35,
  },
  subtitle: {
    color: "#746a5d",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21,
  },
  form: {
    width: 340,
    gap: 12,
  },
  segmented: {
    flexDirection: "row",
    borderRadius: 24,
    backgroundColor: "#eee4d4",
    padding: 4,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    borderRadius: 20,
    paddingVertical: 9,
  },
  activeSegment: {
    backgroundColor: "#fffaf0",
  },
  segmentText: {
    color: "#7d7365",
    fontSize: 15,
    fontWeight: "900",
  },
  activeSegmentText: {
    color: "#26231f",
  },
  emailGroup: {
    gap: 10,
  },
  input: {
    borderColor: "#d9cdbc",
    borderRadius: 18,
    borderWidth: 2,
    color: "#26231f",
    fontSize: 16,
    fontWeight: "700",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#2d2a26",
    borderRadius: 24,
    paddingVertical: 13,
  },
  disabledButton: {
    opacity: 0.58,
  },
  primaryButtonText: {
    color: "#fff9ef",
    fontSize: 16,
    fontWeight: "900",
  },
  errorText: {
    color: "#a83b32",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  statusText: {
    color: "#2f7c57",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 16,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: "#ded2c2",
  },
  dividerText: {
    color: "#8b8174",
    fontSize: 13,
    fontWeight: "800",
  },
  methodList: {
    gap: 9,
  },
  methodButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderColor: "#d9cdbc",
    borderRadius: 23,
    borderWidth: 2,
    paddingHorizontal: 14,
    gap: 12,
  },
  methodMark: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#2d2a26",
  },
  methodMarkText: {
    color: "#fff9ef",
    fontSize: 13,
    fontWeight: "900",
  },
  methodText: {
    color: "#2d2a26",
    fontSize: 15,
    fontWeight: "900",
  },
  prototypeNote: {
    color: "#8b8174",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    textAlign: "center",
  },
});

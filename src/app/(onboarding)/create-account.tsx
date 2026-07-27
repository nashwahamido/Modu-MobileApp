import { router, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { useMemo, useState } from "react";
import { Image, Pressable, Text, TextInput, View } from "react-native";
import {
  continueWithEmail,
  continueWithPrototypeProvider,
  type AccountMode,
  type PrototypeAuthMethod,
} from "@/src/services/auth";

import { Button } from "@/src/game/ui/Button";
import { useStyles, useTheme } from "@/src/game/ui/theme";
import { makeStyles } from "./create-account.styles";

const mascot = require("../../assets/images/mascot/mascot.png");
const loadingRoute = "/loading" as Href;

const authMethods = [
  { id: "google", label: "Continue with Google", mark: "G" },
  { id: "apple", label: "Continue with Apple", mark: "A" },
  { id: "phone", label: "Continue with phone", mark: "#" },
];

export default function CreateAccountScreen() {
  const styles = useStyles(makeStyles);
  const t = useTheme();
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
              placeholderTextColor={t.textFaint}
              style={styles.input}
              value={email}
            />
            <Button
              label={busy ? "Connecting..." : copy.primary}
              variant="primary"
              pill
              disabled={busy}
              onPress={() => continueFlow("email")}
            />
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

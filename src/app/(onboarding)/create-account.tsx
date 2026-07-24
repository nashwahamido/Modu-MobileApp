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

import { Button } from "@/src/game/ui/Button";
import { SPACE, Theme, TYPE, useStyles, useTheme } from "@/src/game/ui/theme";

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

const makeStyles = (t: Theme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: t.bg,
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
      gap: SPACE.sm,
    },
    brand: {
      color: t.gold,
      fontSize: 32,
      fontWeight: "900",
      letterSpacing: 7,
    },
    title: {
      ...TYPE.title,
      color: t.text,
      fontSize: 30,
      fontWeight: "900",
      lineHeight: 35,
    },
    subtitle: {
      ...TYPE.body,
      color: t.textDim,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 21,
    },
    form: {
      width: 340,
      gap: SPACE.md,
    },
    segmented: {
      flexDirection: "row",
      borderRadius: 24,
      backgroundColor: t.surfaceInset,
      padding: SPACE.xs,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      borderRadius: 20,
      paddingVertical: 9,
    },
    activeSegment: {
      backgroundColor: t.surface,
    },
    segmentText: {
      ...TYPE.label,
      color: t.textDim,
      fontSize: 15,
      fontWeight: "900",
    },
    activeSegmentText: {
      color: t.text,
    },
    emailGroup: {
      gap: 10,
    },
    input: {
      borderColor: t.borderStrong,
      borderRadius: 18,
      borderWidth: 2,
      color: t.text,
      fontSize: 16,
      fontWeight: "700",
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.md,
    },
    disabledButton: {
      opacity: 0.58,
    },
    errorText: {
      ...TYPE.labelSm,
      color: t.danger,
      fontWeight: "800",
      lineHeight: 16,
    },
    statusText: {
      ...TYPE.labelSm,
      color: t.success,
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
      backgroundColor: t.border,
    },
    dividerText: {
      color: t.textDim,
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
      borderColor: t.borderStrong,
      borderRadius: 23,
      borderWidth: 2,
      paddingHorizontal: 14,
      gap: SPACE.md,
    },
    methodMark: {
      width: 26,
      height: 26,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 13,
      backgroundColor: t.surfaceRaised,
    },
    methodMarkText: {
      ...TYPE.labelSm,
      color: t.text,
      fontSize: 13,
      fontWeight: "900",
    },
    methodText: {
      ...TYPE.label,
      color: t.text,
      fontSize: 15,
      fontWeight: "900",
    },
    prototypeNote: {
      ...TYPE.labelSm,
      color: t.textDim,
      fontWeight: "700",
      lineHeight: 16,
      textAlign: "center",
    },
  });

// Local design tokens for the dev harness only, so src/dev/ stays self-contained and can be deleted without touching shared code.

export const Status = {
  discover: "#2f6fed",
  ready: "#1f9d57",
  attention: "#e0871a",
  wrong: "#d23b3b",
  done: "#1f9d57",
};

export const Spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, touch: 56 };

export const Radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export const Surface = {
  light: {
    bg: "#fafafd",
    card: "#ffffff",
    cardAlt: "#eef0f6",
    border: "#d9dbe6",
    primary: "#5a4bd6",
    onPrimary: "#ffffff",
    text: "#1b1b1f",
    muted: "#5b5d6b",
  },
  dark: {
    bg: "#0f1014",
    card: "#1a1c22",
    cardAlt: "#242732",
    border: "#33343f",
    primary: "#8b7dff",
    onPrimary: "#0f1014",
    text: "#ECEDEE",
    muted: "#a0a3b1",
  },
};

export const typeScale = (fontScale = 1) => ({
  caption: Math.round(14 * fontScale),
  body: Math.round(17 * fontScale),
  step: Math.round(22 * fontScale),
  title: Math.round(26 * fontScale),
});

import { ACTIONS, AssemblyAction, Stage } from './assembly';

/** First stage that still has incomplete actions. */
export function currentStage(done: ReadonlySet<string>): Stage {
  for (const stage of [1, 2, 3, 4] as const) {
    if (ACTIONS.some((a) => a.stage === stage && !done.has(a.id))) return stage;
  }
  return 4;
}

export function availableActions(done: ReadonlySet<string>): AssemblyAction[] {
  const stage = currentStage(done);
  return ACTIONS.filter(
    (a) =>
      a.stage === stage &&
      !done.has(a.id) &&
      a.requires.every((requiredActionId) => done.has(requiredActionId)),
  );
}

type CeoCandidate = {
  id: string;
  name: string;
  role: string;
  status: string;
};

/**
 * Another non-terminated CEO in the same company.
 * The agent update API does not reject a second CEO, so callers use this for
 * a note only. Join approval still picks the root CEO, then the first CEO.
 */
export function findOtherActiveCeo<T extends CeoCandidate>(
  agents: readonly T[],
  agentId: string,
): T | null {
  return (
    agents.find(
      (agent) =>
        agent.id !== agentId &&
        agent.role === "ceo" &&
        agent.status !== "terminated",
    ) ?? null
  );
}

import { Turnout, TurnoutState } from '../types.js';

export interface TurnoutEvents {
  onTurnoutUpdated: (turnout: Turnout) => void;
  onLog: (message: string, level?: 'info' | 'warn' | 'error') => void;
}

export class TurnoutManager {
  private turnouts: Map<string, Turnout> = new Map();
  private events: TurnoutEvents;

  constructor(initialTurnouts: Turnout[], events: TurnoutEvents) {
    this.events = events;
    for (const to of initialTurnouts) {
      this.turnouts.set(to.id, { ...to });
    }
  }

  getTurnout(id: string): Turnout | undefined {
    return this.turnouts.get(id);
  }

  getAllTurnouts(): Turnout[] {
    return Array.from(this.turnouts.values());
  }

  updateTurnout(updatedTo: Turnout): void {
    this.turnouts.set(updatedTo.id, { ...updatedTo });
    this.events.onTurnoutUpdated(updatedTo);
  }

  setTurnoutState(id: string, state: TurnoutState, force = false): boolean {
    const to = this.turnouts.get(id);
    if (!to) return false;

    if (to.locked && !force) {
      this.events.onLog(`Weiche ${to.name} ist durch Fahrstraße verriegelt und kann nicht manuell geschaltet werden!`, 'warn');
      return false;
    }

    to.state = state;
    this.events.onTurnoutUpdated(to);
    this.events.onLog(`Weiche ${to.name} auf ${state === 'STRAIGHT' ? 'Gerade' : 'Abzweig'} geschaltet.`, 'info');
    return true;
  }

  lockTurnouts(turnoutSettings: { turnoutId: string; state: TurnoutState }[], routeId: string): boolean {
    // Vorprüfung: Ist irgendeine Weiche bereits anderweitig verriegelt?
    for (const setting of turnoutSettings) {
      const to = this.turnouts.get(setting.turnoutId);
      if (!to || (to.locked && to.lockedByRouteId !== routeId)) {
        return false;
      }
    }

    // Stellen und Verriegeln
    for (const setting of turnoutSettings) {
      const to = this.turnouts.get(setting.turnoutId)!;
      to.state = setting.state;
      to.locked = true;
      to.lockedByRouteId = routeId;
      this.events.onTurnoutUpdated(to);
    }
    return true;
  }

  unlockTurnouts(routeId: string): void {
    for (const to of this.turnouts.values()) {
      if (to.lockedByRouteId === routeId) {
        to.locked = false;
        to.lockedByRouteId = null;
        this.events.onTurnoutUpdated(to);
      }
    }
  }

  unlockAll(): void {
    for (const to of this.turnouts.values()) {
      if (to.locked) {
        to.locked = false;
        to.lockedByRouteId = null;
        this.events.onTurnoutUpdated(to);
      }
    }
  }
}


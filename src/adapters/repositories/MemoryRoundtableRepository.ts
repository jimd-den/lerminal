import { Roundtable } from "../../entities/roundtable";
import { RoundtableRepository } from "../../usecases/ports/repositories/RoundtableRepository";

/** In-memory roundtable store for tests and zero-latency fallbacks. */
export class MemoryRoundtableRepository implements RoundtableRepository {
  private roundtables: Map<string, Roundtable> = new Map();

  async getRoundtables(): Promise<Roundtable[]> {
    return Array.from(this.roundtables.values());
  }

  async saveRoundtable(roundtable: Roundtable): Promise<void> {
    this.roundtables.set(roundtable.id, roundtable);
  }

  async deleteRoundtable(id: string): Promise<void> {
    this.roundtables.delete(id);
  }
}

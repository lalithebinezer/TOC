import { BimEngine } from "../core/BimEngine";
import { ScheduleManager } from "../schedule-manager";

export class Timeline4DModule {
  private engine: BimEngine;
  public scheduleManager: ScheduleManager;
  private isPlaying: boolean = false;
  private timer: any = null;

  constructor() {
    this.engine = BimEngine.getInstance();
    this.scheduleManager = (window as any).scheduleManager || new ScheduleManager();
  }

  public startSimulation(onStep?: (currentDate: string) => void) {
    if (this.isPlaying) return;
    this.isPlaying = true;

    const startDate = new Date("2026-01-01");
    const endDate = new Date("2026-12-31");
    let current = new Date(startDate);

    this.timer = setInterval(() => {
      if (current > endDate) {
        this.stopSimulation();
        return;
      }

      const dateStr = current.toISOString().split("T")[0];
      if ((this.scheduleManager as any).updateTimeline) {
        (this.scheduleManager as any).updateTimeline(dateStr, this.engine.fragments);
      }
      if (onStep) onStep(dateStr);

      current.setDate(current.getDate() + 5);
    }, 400);
  }

  public stopSimulation() {
    this.isPlaying = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

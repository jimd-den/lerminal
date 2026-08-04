import {
  AppNotification,
  NotificationGateway,
} from "../../usecases/ports/gateways/NotificationGateway";
import { Logger, silentLogger } from "../../usecases/ports/Logger";

/**
 * # Silent Notification Gateway
 *
 * ## Business Value & Purpose
 * The notification port, wired to nothing. Used where the host cannot deliver a
 * notification at all — Expo Go, where `expo-notifications` has no native module behind it
 * and touching it takes the whole screen down with it.
 *
 * The port already promises that a build without notification support "degrades to silence
 * rather than failing a run that already succeeded". This is that silence, made explicit,
 * so the degraded case is a chosen implementation rather than a swallowed crash.
 */
export class SilentNotificationGateway implements NotificationGateway {
  constructor(private readonly logger: Logger = silentLogger) {}

  async requestPermission(): Promise<boolean> {
    return false;
  }

  async notify(notification: AppNotification): Promise<void> {
    // Logged, not shown: during development the log is how you confirm the app *would*
    // have notified, which is the only thing Expo Go can honestly tell you.
    this.logger.debug("notifications.suppressed", { title: notification.title });
  }
}

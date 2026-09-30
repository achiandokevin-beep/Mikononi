import AfricasTalking from "africastalking";
import { cfg } from "../../config";
export const at = AfricasTalking({ username: cfg.atUser, apiKey: cfg.atKey });

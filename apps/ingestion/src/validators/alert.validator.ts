import { z } from "zod";

/**
 * Wazuh alert payload (as posted by the manager's custom-remote integration,
 * i.e. the full alert object).
 *
 * See: https://documentation.wazuh.com/current/user-manual/reference/ossec-conf/integration.html
 */
export const wazuhAlertSchema = z
  .object({
    id: z.string().optional(),
    timestamp: z.string().optional(),
    rule: z
      .object({
        id: z.string().optional(),
        level: z.number().optional(),
        description: z.string().optional(),
      })
      .passthrough()
      .optional(),
    agent: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        ip: z.string().optional(),
      })
      .passthrough()
      .optional(),
    location: z.string().optional(),
    full_log: z.string().optional(),
  })
  .passthrough();

export type WazuhAlert = z.infer<typeof wazuhAlertSchema>;

/**
 * Suricata alert event, as emitted to eve.json (event_type "alert").
 *
 * See: https://suricata.readthedocs.io/en/latest/output/eve/eve-json-format.html
 */
export const suricataAlertSchema = z
  .object({
    timestamp: z.string(),
    event_type: z.literal("alert"),
    src_ip: z.string().optional(),
    src_port: z.number().optional(),
    dest_ip: z.string().optional(),
    dest_port: z.number().optional(),
    proto: z.string().optional(),
    alert: z
      .object({
        signature: z.string(),
        signature_id: z.number().optional(),
        severity: z.number().optional(),
        category: z.string().optional(),
      })
      .passthrough(),
  })
  .passthrough();

export type SuricataAlert = z.infer<typeof suricataAlertSchema>;

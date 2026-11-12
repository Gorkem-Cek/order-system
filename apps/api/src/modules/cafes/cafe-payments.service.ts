import type { CafePaymentSettings, IyzicoMode, UpdateCafePaymentRequest } from "@siparis/shared";
import { AppError, notFound } from "../../lib/errors";
import type { SecretBox } from "../../lib/secret-box";
import {
  IYZICO_LIVE_URL,
  IYZICO_SANDBOX_URL,
  IyzicoError,
  type IyzicoClient,
  type IyzicoCredentials,
} from "../payments/iyzico";
import type { CafesRepository } from "./cafes.repository";

export const iyzicoBaseUrl = (mode: IyzicoMode) =>
  mode === "LIVE" ? IYZICO_LIVE_URL : IYZICO_SANDBOX_URL;

type CafePaymentRow = {
  address: string | null;
  city: string | null;
  iyzicoMode: IyzicoMode | null;
  iyzicoApiKey: string | null;
};

function toSettings(cafe: CafePaymentRow): CafePaymentSettings {
  return {
    mode: cafe.iyzicoMode,
    apiKeyEnding: cafe.iyzicoApiKey ? cafe.iyzicoApiKey.slice(-4) : null,
    address: cafe.address,
    city: cafe.city,
  };
}

/** Each café's iyzico account: where its guests' payments go. Managed by the super-admin. */
export function createCafePaymentsService(deps: {
  cafes: CafesRepository;
  /** Null when PAYMENT_SECRET_KEY isn't configured: keys then can't be saved. */
  secretBox: SecretBox | null;
  iyzico: (credentials: IyzicoCredentials) => IyzicoClient;
}) {
  const { cafes, secretBox, iyzico } = deps;

  const cafeOf = async (id: string) => {
    const cafe = await cafes.findById(id);
    if (!cafe) throw notFound("Café");
    return cafe;
  };

  return {
    async get(id: string): Promise<CafePaymentSettings> {
      return toSettings(await cafeOf(id));
    },

    /**
     * Saves the café's address and iyzico account. New keys are checked with iyzico first, so
     * a typo is caught now rather than when a guest tries to pay.
     */
    async update(id: string, input: UpdateCafePaymentRequest): Promise<CafePaymentSettings> {
      const cafe = await cafeOf(id);
      const hasKeys = Boolean(cafe.iyzicoApiKey && cafe.iyzicoSecretKey);
      const newKeys =
        input.apiKey && input.secretKey
          ? { apiKey: input.apiKey, secretKey: input.secretKey }
          : null;
      // Sandbox and live accounts have different keys, so switching needs new ones.
      if (!newKeys && (!hasKeys || cafe.iyzicoMode !== input.mode)) {
        throw new AppError(400, "VALIDATION_FAILED", "Enter the iyzico API and secret keys", {
          reason: "KEYS_REQUIRED",
        });
      }

      let sealedSecret = cafe.iyzicoSecretKey;
      if (newKeys) {
        if (!secretBox) {
          throw new AppError(503, "PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_SECRET_KEY isn't set");
        }
        try {
          await iyzico({
            apiKey: newKeys.apiKey,
            secretKey: newKeys.secretKey,
            baseUrl: iyzicoBaseUrl(input.mode),
          }).checkCredentials();
        } catch (error) {
          if (error instanceof IyzicoError && error.code !== undefined) {
            throw new AppError(400, "PAYMENT_KEYS_REJECTED", "iyzico rejected these keys", {
              iyzicoCode: error.code,
            });
          }
          throw new AppError(502, "PAYMENT_PROVIDER_UNAVAILABLE", "Couldn't reach iyzico");
        }
        sealedSecret = secretBox.seal(newKeys.secretKey);
      }

      return toSettings(
        await cafes.updatePayment(id, {
          address: input.address,
          city: input.city,
          iyzicoMode: input.mode,
          iyzicoApiKey: newKeys ? newKeys.apiKey : cafe.iyzicoApiKey,
          iyzicoSecretKey: sealedSecret,
        }),
      );
    },

    /** Disconnects the café's iyzico account; its guests can't pay until keys are saved again. */
    async removeKeys(id: string): Promise<void> {
      await cafeOf(id);
      await cafes.updatePayment(id, {
        iyzicoMode: null,
        iyzicoApiKey: null,
        iyzicoSecretKey: null,
      });
    },
  };
}

export type CafePaymentsService = ReturnType<typeof createCafePaymentsService>;

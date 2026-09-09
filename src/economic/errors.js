/**
 * Error raised for any failure while talking to the e-conomic API or while
 * resolving the credentials for a call.
 *
 * Attributes:
 *   status (number): HTTP status of the failed response, or 0 when no
 *     response was received (network failure, timeout, configuration error).
 *   errorCode (string|undefined): e-conomic error code such as "E06000", or a
 *     local code prefixed with "E_" such as "E_COMPANY_REQUIRED".
 *   details (object|undefined): Raw error payload from the API. Logged to
 *     stderr only, never returned to the model.
 *   hint (string|undefined): Developer hint from the API. Logged only.
 */
export class EconomicApiError extends Error {
  constructor(message, { status, errorCode, details, hint } = {}) {
    super(message);
    this.name = "EconomicApiError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
    this.hint = hint;
  }
}

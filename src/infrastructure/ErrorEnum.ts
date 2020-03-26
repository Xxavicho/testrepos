/**
 *
 */
import { KushkiErrors, StatusCodeEnum } from "@kushki/core";

export enum ErrorCode {
  E001 = "E001",
  E003 = "E003",
  E004 = "E004",
  E006 = "E006",
  E007 = "E007",
  E008 = "E008",
  E009 = "E009",
  E010 = "E010",
  E011 = "E011",
  E012 = "E012",
  E013 = "E013",
  E015 = "E015",
  E020 = "E020",
  E021 = "E021",
  E023 = "E023",
  E025 = "E025",
  E322 = "E322",
  E323 = "E323",
}

const ERROR_REJECTED_TRANSACTION: string = "Transacción rechazada.";
const CVV2_REJECTED_TRANSACTION: string = "Transacción no permitida sin ccv2.";

export const ERRORS: KushkiErrors<ErrorCode> = {
  [ErrorCode.E001]: {
    code: ErrorCode.E001,
    message: "Cuerpo de la petición inválido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E003]: {
    code: ErrorCode.E003,
    message: "Procesador no existe.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E004]: {
    code: ErrorCode.E004,
    message: "Id de comercio no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E006]: {
    code: ErrorCode.E006,
    message: "Aurus Error.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E007]: {
    code: ErrorCode.E007,
    message: "Tarjeta bloqueada por el emisor.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E008]: {
    code: ErrorCode.E008,
    message: "Token incorrecto.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E009]: {
    code: ErrorCode.E009,
    message: "Review SSM variables.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E010]: {
    code: ErrorCode.E010,
    message: "Error al destokenizar el token enviado.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E011]: {
    code: ErrorCode.E011,
    message: "Bin no válido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E012]: {
    code: ErrorCode.E012,
    message: "Monto de captura inválido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E013]: {
    code: ErrorCode.E013,
    message: "Transacción tokenizada como diferido.",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E015]: {
    code: ErrorCode.E015,
    message: CVV2_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E020]: {
    code: ErrorCode.E020,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E021]: {
    code: ErrorCode.E021,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E023]: {
    code: ErrorCode.E023,
    message: "Monto del void superior al del sale",
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E025]: {
    code: ErrorCode.E025,
    message: "Tarjeta inválida",
    statusCode: StatusCodeEnum.BadRequest,
  },

  [ErrorCode.E322]: {
    code: ErrorCode.E322,
    message: ERROR_REJECTED_TRANSACTION,
    statusCode: StatusCodeEnum.BadRequest,
  },
  [ErrorCode.E323]: {
    code: ErrorCode.E323,
    message: "Código de seguridad incorrecto.",
    statusCode: StatusCodeEnum.BadRequest,
  },
};

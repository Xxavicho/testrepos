/**
 * Tax enum
 */

export enum TaxCode {
  tasaAeroportuaria = "tasaAeroportuaria",
  propina = "propina",
  iac = "iac",
  agenciaDeViaje = "agenciaDeViaje",
}

export const TAXES: Taxes = {
  [TaxCode.tasaAeroportuaria]: {
    code: "TASA_AERO",
    id: "4",
  },
  [TaxCode.propina]: {
    code: "PROPINA",
    id: "3",
  },
  [TaxCode.iac]: {
    code: "IAC",
    id: "6",
  },
  [TaxCode.agenciaDeViaje]: {
    code: "TASA_ADMIN_AGEN_COD",
    id: "5",
  },
};

export type TaxAttr = {
  code: string;
  id: string;
};
export type Taxes<T extends string = TaxCode> = { [k in T]: TaxAttr };

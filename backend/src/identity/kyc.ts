import { randomUUID, createHash } from 'node:crypto';

export interface OnboardingInput {
  email: string;
  fullName: string;
  documentId: string;
}

export interface InvestorIdentity {
  investorId: string;
  email: string;
  enrollmentRef: string; // referencia al cert/key custodiado (HSM)
}

// Stub. En producción:
//  1) Verificación contra proveedor KYC (Onfido / Veriff / Jumio).
//  2) Si OK, enroll del cert en Fabric CA con atributo "investorId" = hash(documentId).
//  3) Guardar la clave privada en el HSM bajo enrollmentRef.
//  4) Devolver investorId para añadirlo a la allowlist on-chain.
export async function onboardInvestor(input: OnboardingInput): Promise<InvestorIdentity> {
  const investorId = createHash('sha256').update(input.documentId).digest('hex').slice(0, 32);
  return {
    investorId,
    email: input.email,
    enrollmentRef: randomUUID(),
  };
}

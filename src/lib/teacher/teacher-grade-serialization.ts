import { Prisma } from "@/generated/prisma/client";

type ClientSerializable<T> = T extends Prisma.Decimal
  ? string
  : T extends Date
    ? Date
    : T extends readonly (infer Item)[]
      ? ClientSerializable<Item>[]
      : T extends object
        ? { [Key in keyof T]: ClientSerializable<T[Key]> }
        : T;

/** Converts Prisma Decimal values recursively while preserving exact score precision. */
export function serializeTeacherGradebook<T>(value: T): ClientSerializable<T> {
  if (value instanceof Prisma.Decimal) return value.toString() as ClientSerializable<T>;
  if (value instanceof Date || value === null || typeof value !== "object") return value as ClientSerializable<T>;
  if (Array.isArray(value)) return value.map((item) => serializeTeacherGradebook(item)) as ClientSerializable<T>;

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, serializeTeacherGradebook(item)]),
  ) as ClientSerializable<T>;
}

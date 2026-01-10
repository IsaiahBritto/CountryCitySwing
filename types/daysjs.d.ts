import dayjs from "dayjs";

declare module "dayjs" {
  interface Dayjs {
    isSameOrAfter(date: dayjs.ConfigType, unit?: dayjs.OpUnitType): boolean;
  }
}

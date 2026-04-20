import "server-only";
import {
  getStoreConfigFields,
  getStoreConfigSections,
  saveStoreConfig,
} from "@/lib/store-settings";

export const getAdminConfigFields = getStoreConfigFields;
export const getAdminConfigSections = getStoreConfigSections;
export const saveAdminConfig = saveStoreConfig;

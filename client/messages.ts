import { defineTranslations } from "@getpaseo/plugin/client";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import zhCN from "./locales/zh-CN.json";

export const messages = defineTranslations({ resources: { en, ko, ja, "zh-CN": zhCN } });

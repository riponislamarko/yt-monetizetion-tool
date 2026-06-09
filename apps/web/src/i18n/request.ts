// next-intl "without i18n routing" setup. EN is the only locale; messages are loaded once
// per request on the server and handed to NextIntlClientProvider in the layout.
import { getRequestConfig } from "next-intl/server";
import messages from "../../messages/en.json";

export default getRequestConfig(async () => ({
  locale: "en",
  messages,
}));

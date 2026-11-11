/**
 * App-store build switch (T71). The portal is installable as a web app from
 * the browser, which takes no store commission. If the school ever ships the
 * portal through the Apple App Store or Google Play, build it with
 * NEXT_PUBLIC_STORE_APP=1: every Pay button is then hidden and families see
 * "Fees are paid on our website" instead. Apple's guideline 3.1.3(d) would
 * otherwise require in-app purchase for one-to-many live classes, and Google
 * Play requires Play billing for education services. See docs/payments.md.
 */
export const STORE_APP: boolean = ["1", "true", "yes"].includes((process.env.NEXT_PUBLIC_STORE_APP || "").trim().toLowerCase());

/** The words shown in place of a Pay button in a store build. */
export const STORE_APP_FEES_TEXT = "Fees are paid on our website";

/** Where families pay in a store build (opened in their browser, not in the app). */
export const FEES_WEBSITE_URL = "https://learn.tarbiyyah.co.uk/family/fees/";

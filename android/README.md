# AI Prime Studio — Android App & Google Play Store Release Guide
## Package: `com.aiprimestudio.app` | Target SDK: API 36 | Play Billing: v7.1.1

---

## 🇮🇳 हिंदी में पूरी गाइड (Step-by-Step)

मेरे भाई, आपकी ऐप का पूरा **Native Kotlin + Jetpack Compose** कोड `android/` फोल्डर में Google Play Store की नवीनतम आवश्यकताओं (Target SDK 36, Google Play Billing 7.1.1) के साथ पूरी तरह तैयार है।

### 1. Google Play Console अकाउंट (दूसरी Gmail से बनाना)
> **सवाल:** क्या Google Play Console अकाउंट दूसरी Gmail ID से बना सकते हैं?  
> **जवाब:** **हाँ, 100% बना सकते हैं!** कोई समस्या नहीं आएगी। Google Play Console केवल ऐप पब्लिश करने का स्टोर है। आपकी ऐप का डेटाबेस (Firebase), बैकएंड सर्वर और यूज़र डेटा Google Sign-In और पैकेज नेम (`com.aiprimestudio.app`) से आपस में सिंक होते हैं।

- Google Play Console पर जाएँ: https://play.google.com/console/
- अपनी किसी भी Gmail ID से साइन इन करें और **$25 (वन-टाइम फ़ीस)** देकर डेवलपर अकाउंट एक्टिवेट करें।

---

### 2. Firebase Console में Android ऐप जोड़ना
1. Firebase Console (https://console.firebase.google.com/) में जाएँ।
2. अपना प्रोजेक्ट (`gen-lang-client-0525281130`) खोलें।
3. **+ Add App** पर क्लिक करके **Android** चुनें।
4. पैकेज नेम में डालें: `com.aiprimestudio.app`
5. ऐप निकनेम: `AI Prime Studio`
6. **google-services.json** फ़ाइल डाउनलोड करें और उसे प्रोजेक्ट के `android/app/` फ़ोल्डर में रख दें।
   *(नोट: हमने `android/app/build.gradle.kts` में ऑटो-डिटेक्ट लगा दिया है — जैसे ही आप असली फ़ाइल रखेंगे, Google Services अपने आप सक्रिय हो जाएगी!)*

---

### 3. Android Studio में ऐप खोलना और AAB (App Bundle) बनाना
1. अपने कंप्यूटर पर **Android Studio** खोलें।
2. **Open Project** पर क्लिक करके `android` फ़ोल्डर सेलेक्ट करें।
3. Gradle Sync पूरा होने दें।
4. मेन्यू से जाएँ: **Build > Generate Signed Bundle / APK**
5. **Android App Bundle (.aab)** चुनें।
6. **Create New Keystore** पर क्लिक करके पासवर्ड सेट करें और `release.keystore` सेव करें।
7. **Release** वैरिएंट सेलेक्ट करके **Create** दबाएँ।
8. कुछ ही मिनटों में आपकी प्रोडक्शन रेडी फ़ाइल बन जाएगी:  
   `android/app/release/app-release.aab`

---

### 4. Google Play Console में Subscriptions और In-App Products
Play Console के **Monetize > Subscriptions & In-App Products** में ये प्रोडक्ट्स जोड़ें:

| Product Type | Product ID | नाम | प्राइस | क्रेडिट्स |
| :--- | :--- | :--- | :--- | :--- |
| Subscription | `plan_intro_daily` | Trail Offer | ₹1 / 24h | 40 Credits |
| Subscription | `sub_weekly_creator` | Creator Weekly | ₹199 / Week | 230 Credits |
| Subscription | `sub_monthly_creator` | Creator Monthly | ₹998 / Month | 1,200 Credits |
| In-App Product | `topup_49` | Starter Top-Up | ₹49 | 45 Credits |
| In-App Product | `topup_99` | Creator Top-Up | ₹99 | 95 Credits |
| In-App Product | `topup_199` | Power Top-Up | ₹199 | 200 Credits |
| In-App Product | `topup_399` | Studio Top-Up | ₹399 | 420 Credits |

बैकएंड रूट `/api/billing/googleplay/verify` अब:
- पैकेज नेम `com.aiprimestudio.app` की सख्त जांच करता है
- किसी भी अज्ञात प्रोडक्ट को तुरंत रिजेक्ट करता है
- SHA-256 डुप्लीकेट प्रिवेंशन से एक ही टोकन से दोबारा क्रेडिट देने से रोकता है
- और यूज़र के वॉलेट व सब्सक्रिप्शन को तुरंत वेब और ऐप दोनों जगह सिंक करता है!

---

### 5. Razorpay लाइव स्थिति और UPI AutoPay
- डायग्नोस्टिक एंडपॉइंट: `GET /api/payments/razorpay/capabilities`
- जब आपने रेज़रपे डैशबोर्ड में नई लाइव कीज जनरेट करके पुरानी को डिएक्टिवेट किया, तो नए Key ID और Secret को अपने रनटाइम एनवायरनमेंट में अपडेट करना आवश्यक है।
- चाबियों के एक्टिव होने के बाद यदि `authSuccess: true` हो लेकिन `recurring.upi: false` या `recurring.upi_autopay` disabled दिखे, तो Razorpay Support टिकट में कहें कि मर्चेंट आईडी पर recurring UPI AutoPay इनेबल कर दें।

---

## 🇬🇧 Technical Reference (English)

### Architecture Highlights
- **Package Name**: `com.aiprimestudio.app`
- **Target SDK**: API 36 (Android 16 compatible)
- **Min SDK**: API 26 (Android 8.0+)
- **Framework**: Native Android Kotlin + Jetpack Compose Material 3
- **Billing**: Google Play Billing Library v7.1.1 (`BillingManager.kt`) with `PendingPurchasesParams`
- **Logging**: Level.NONE in release builds (zero leakage of bearer or purchase tokens)
- **Signing**: Safe Release Signing config reading from environment / keystore file
- **Icons**: Adaptive vector launcher icons included in `res/mipmap-anydpi-v26`
- **Unified Ledger**: Shared Firestore wallet balance across Web & Android

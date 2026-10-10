# AI Prime Studio — Android App & Google Play Store Release Guide
## Package: `com.aiprimestudio.app`

---

## 🇮🇳 हिंदी में पूरी गाइड (Step-by-Step)

मेरे भाई, आपकी ऐप का पूरा **Native Kotlin + Jetpack Compose** कोड `android/` फोल्डर में तैयार कर दिया गया है। अब गूगल प्ले स्टोर पर लाइव करने के लिए आपको और मुझे क्या-क्या करना है, उसका पूरा हिसाब नीचे दिया गया है:

### 1. Google Play Console अकाउंट (दूसरी Gmail से बनाना)
> **सवाल:** क्या Google Play Console अकाउंट दूसरी Gmail ID से बना सकते हैं?  
> **जवाब:** **हाँ, 100% बना सकते हैं!** कोई समस्या नहीं आएगी। Google Play Console केवल ऐप पब्लिश करने का स्टोर है। आपकी ऐप का डेटाबेस (Firebase), सर्वर और यूज़र डेटा Google Sign-In और पैकेज नेम (`com.aiprimestudio.app`) से आपस में सिंक होते हैं।

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
7. `android/app/build.gradle.kts` में लाइन `id("com.google.gms.google-services")` का कमेंट हटा दें (`uncomment` कर दें)।

---

### 3. Android Studio में ऐप खोलना और AAB बनाना
1. अपने कंप्यूटर पर **Android Studio** खोलें।
2. **Open Project** पर क्लिक करके `android` फ़ोल्डर सेलेक्ट करें।
3. Gradle Sync पूरा होने दें।
4. मेन्यू से जाएँ: **Build > Generate Signed Bundle / APK**
5. **Android App Bundle (.aab)** चुनें।
6. **Create New Keystore** पर क्लिक करके पासवर्ड सेट करें और `keystore.jks` सेव करें।
7. **Release** वैरिएंट सेलेक्ट करके **Create** दबाएँ।
8. कुछ ही मिनटों में आपकी प्रोडक्शन रेडी फ़ाइल बन जाएगी:  
   `android/app/release/app-release.aab`

---

### 4. Google Play Console में Subscriptions बनाना
Google Play Policy के अनुसार Android ऐप के अंदर पेमेंट **Google Play Billing** से ही होनी चाहिए।
Play Console के **Monetize > Subscriptions** सेक्शन में ये 3 प्रोडक्ट्स जोड़ें:

| Product ID | नाम | प्राइस | साइकिल | क्रेडिट्स |
| :--- | :--- | :--- | :--- | :--- |
| `plan_intro_daily` | Double Bonanza | ₹1 | 24 Hours Intro | 50 Credits |
| `sub_weekly_creator` | Creator Weekly | ₹199 | Weekly (7 Days) | 300 Credits |
| `sub_monthly_creator` | Creator Monthly | ₹998 | Monthly (30 Days) | 1,800 Credits |

जब कोई यूज़र एंड्रॉइड ऐप से सब्सक्राइब करेगा, तो बैकएंड का नया रूट `/api/billing/googleplay/verify` तुरंत उसकी खरीदारी को वेरिफाई करके उसी Google खाते में क्रेडिट्स जोड़ देगा!

---

### 5. वेबसाइट पर Razorpay UPI AutoPay का स्टेटस
वेबसाइट पर मोबाइल यूज़र्स के लिए UPI AutoPay का लाइव स्टेटस चेक करने के लिए बैकएंड पर नया डायग्नोस्टिक एंडपॉइंट जोड़ दिया गया है:  
`GET /api/payments/razorpay/capabilities`

- जब आप ब्राउज़र में `https://<YOUR_DOMAIN>/api/payments/razorpay/capabilities` खोलेंगे, तो यह रेज़रपे के लाइव सर्वर से सीधे बात करके बताएगा कि आपके मर्चेंट अकाउंट पर `recurring.upi_autopay` चालू है या नहीं।
- अगर Razorpay API में `recurring.upi: false` आ रहा है, तो Razorpay Support टिकट में यह मैसेज भेजें:
  > *"Dear Razorpay Support, We have integrated the official Subscriptions flow with customer registration and valid 10-digit mobile contact for our merchant account. However, the live methods API reports recurring.upi as false and recurring.upi_autopay as disabled. Kindly activate recurring UPI AutoPay on our Merchant ID so that mobile users can authorize recurring mandates via UPI apps."*

---

## 🇬🇧 Technical Reference (English)

### Architecture Highlights
- **Package Name**: `com.aiprimestudio.app`
- **Framework**: Native Android Kotlin + Jetpack Compose Material 3
- **Billing**: Google Play Billing Library v7.0.0 (`BillingManager.kt`)
- **Authentication**: Android Credential Manager + Google ID Token exchange (`AuthManager.kt`)
- **Backend Sync**: Retrofit 2 + OkHttp 3 connecting to REST endpoints with Bearer token authentication
- **Unified Ledger**: Shared Firestore wallet balance across Web & Android

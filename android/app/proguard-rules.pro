# AI Prime Studio ProGuard Rules
-keepattributes *Annotation*
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-keep class com.aiprimestudio.app.data.model.** { *; }
-keep class com.android.billingclient.api.** { *; }

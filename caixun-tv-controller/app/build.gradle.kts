plugins { id("com.android.application") }
android {
 namespace="com.grayxon.caixuntv"
 compileSdk=34
 defaultConfig { applicationId="com.grayxon.caixuntv"; minSdk=23; targetSdk=34; versionCode=2; versionName="0.2.0" }
 compileOptions { sourceCompatibility=JavaVersion.VERSION_17; targetCompatibility=JavaVersion.VERSION_17 }
}
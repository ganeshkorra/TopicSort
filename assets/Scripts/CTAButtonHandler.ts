import { _decorator, Component, AudioSource, find, CCString, sys } from 'cc';
import { Analytics, analyticsEvents } from './Analytics';

// Declare the mraid object provided by the ad network environment
declare const mraid: any;

const { ccclass, property } = _decorator;

@ccclass('CTAButtonHandler')
export class CTAButtonHandler extends Component {
    
    @property({
        type: CCString,
        tooltip: 'Default Android Play Store URL'
    })
    public androidStoreUrl: string = "https://play.google.com/store/apps/details?id=com.Superfly.TopicSort&hl=en_IN";

    @property({
        type: CCString,
        tooltip: 'Default iOS App Store URL'
    })
    public iosStoreUrl: string = "https://apps.apple.com/us/app/topic-sort/id6751785619";

    private isMraidReady: boolean = false;

    onLoad() {
        // Check for MRAID environment
        if (typeof mraid !== 'undefined') {
            if (mraid.getState() === 'loading') {
                mraid.addEventListener('ready', this.onMraidReady.bind(this));
            } else {
                this.onMraidReady();
            }
        } else {
            console.warn("MRAID library not found. Fallback to window.open.");
        }
    }

    private onMraidReady(): void {
        this.isMraidReady = true;
    }

    /**
     * Helper to get the correct URL based on Device OS
     */
    private getTargetStoreUrl(): string {
        if (sys.os === sys.OS.IOS) {
            console.log("Device detected: iOS");
            return this.iosStoreUrl;
        } else {
            // Default to Android for Android devices, Desktop browsers, and others
            console.log("Device detected: Android/Other");
            return this.androidStoreUrl;
        }
    }

    /**
     * Linked to the CTA button's click event in the Cocos Inspector
     */
    public onStoreButtonClicked(): void {
        const targetUrl = this.getTargetStoreUrl();
        console.log("CTA Triggered. Target URL:", targetUrl);

        // Fire CTA_CLICKED event
        if (Analytics.instance) {
            Analytics.instance.dispatchEvent(analyticsEvents.CTA_CLICKED);
            console.log("[Analytics] CTA_CLICKED event fired");
        }

        // 1. Stop audio before redirecting (Technical requirement)
        const mainAudio = find("Canvas-001/GameCamera")?.getComponent(AudioSource);
        if (mainAudio) {
            mainAudio.stop();
        }

        // 2. Redirect using MRAID if available
        if (this.isMraidReady) {
            console.log("Calling mraid.open()");
            mraid.open(targetUrl);
        } 
        // 3. Browser fallback
        else {
            console.log("MRAID not available. Calling window.open()");
            window.open(targetUrl, "_blank");
        }
    }
}
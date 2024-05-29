"use client";

import { RefObject, useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";
import {
  Camera,
  FlipHorizontal,
  MoonIcon,
  PersonStanding,
  SunIcon,
  Video,
  Volume2,
} from "lucide-react";
import { Rings } from "react-loader-spinner";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { ModeToggle } from "@/components/ModeToggle";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { beep, drawOnCanvas } from "@/lib/helpers";
import { useTheme } from "next-themes";

// tensorflow models
import * as cocossd from "@tensorflow-models/coco-ssd";
import "@tensorflow/tfjs-backend-cpu";
import "@tensorflow/tfjs-backend-webgl";

let interval: any = null;
let stopTimeout: any = null;

export default function Home() {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  //useful states
  const [mirrored, setMirrored] = useState<boolean>(true);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [autoRecordEnabled, setAutoRecordEnabled] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(0.8);
  const [model, setModel] = useState<cocossd.ObjectDetection>();
  const [loading, setLoading] = useState<boolean>(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const { setTheme } = useTheme();

  //initlize media recorder ref
  useEffect(() => {
    if (webcamRef && webcamRef.current) {
      const stream = (webcamRef.current.video as any).captureStream();
      if (stream) {
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            const recordedBlob = new Blob([e.data], { type: "video/webm" });
            const videoUrl = URL.createObjectURL(recordedBlob);
            const a = document.createElement("a");
            a.href = videoUrl;
            a.download = `${formatDate(new Date())}.webm`;
            a.click();
          }
        };
        mediaRecorderRef.current.onstart = () => {
          setIsRecording(true);
        };
        mediaRecorderRef.current.onstop = () => {
          setIsRecording(false);
        };
      }
      // mediaRecorderRef.current = new MediaRecorder(webcamRef.current.video);
    }
  }, [webcamRef]);

  useEffect(() => {
    setLoading(true);
    initModel();
  }, []);

  async function initModel() {
    const loadedModel: cocossd.ObjectDetection = await cocossd.load({
      base: "mobilenet_v2",
    });
    setModel(loadedModel);
  }

  useEffect(() => {
    if (model) {
      setLoading(false);
    }
  }, [model]);

  async function runPrediction() {
    if (
      model &&
      webcamRef.current &&
      webcamRef.current.video &&
      webcamRef.current.video?.readyState === 4
    ) {
      const predictions = await model.detect(webcamRef.current.video);
      // console.log(predections);
      resizeCanvas(canvasRef, webcamRef);
      drawOnCanvas(mirrored, predictions, canvasRef.current?.getContext("2d"));

      let isPerson: boolean = false;
      if (predictions.length > 0) {
        predictions.forEach((prediction) => {
          isPerson = prediction.class === "person";
        });
        if (isPerson && autoRecordEnabled) {
          startRecording(true);
        }
      }
    }
  }

  useEffect(() => {
    interval = setInterval(() => {
      runPrediction();
    }, 100);

    return () => {
      clearInterval(interval);
    };
  }, [webcamRef.current, model, mirrored, autoRecordEnabled]);

  return (
    <div className="flex h-screen">
      {/* Left side of the object detection page */}
      <div className="relative">
        <div className="relative h-screen w-full">
          <Webcam
            ref={webcamRef}
            mirrored={mirrored}
            // videoConstraints={{ width: 1280, height: 720 }}
            className="w-full h-full object-contain p-2"
          />
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 h-full w-full object-contain"
          ></canvas>
        </div>
      </div>
      {/* Right side of the object detection page */}
      <div className="flex flex-row flex-1">
        <div className="border-primary/5 border-2 max-w-xs flex flex-col gap-2 justify-between shadow-md rounded-md p-4">
          {/* Top section */}
          <div className="flex flex-col gap-2">
            <ModeToggle />
            <Button
              variant="outline"
              size="icon"
              onClick={() => setMirrored((prev) => !prev)}
            >
              <FlipHorizontal />
            </Button>
            <Separator className="my-2" />
          </div>
          {/* Middle section */}
          <div className="flex flex-col gap-2">
            <Separator className="my-2" />
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={userPromptScreenshot}
            >
              <Camera />
            </Button>
            <Button
              variant={isRecording ? "destructive" : "outline"}
              size="icon"
              onClick={userPromptRecord}
            >
              <Video />
            </Button>
            <Button
              variant={autoRecordEnabled ? "destructive" : "outline"}
              size="icon"
              onClick={toggleAutoRecord}
            >
              {autoRecordEnabled ? (
                <Rings color="white" height={45} />
              ) : (
                <PersonStanding />
              )}
            </Button>
            <Separator className="my-2" />
          </div>
          {/* Bottom section */}
          <div className="flex flex-col gap-2">
            <Separator className="my-2" />
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setIsRecording((prev) => !prev)}
                >
                  <Volume2 />
                </Button>
              </PopoverTrigger>
              <PopoverContent>
                <Slider
                  max={1}
                  min={0}
                  step={0.2}
                  defaultValue={[volume]}
                  onValueCommit={(value) => {
                    setVolume(value[0]);

                    beep(value[0]);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Separator className="my-2" />
          </div>
        </div>
        <div className="flex-1 h-full py-4 px-2 overflow-y-scroll">
          <RenderFeatureHighlightsSection />
        </div>
      </div>
      {loading && (
        <div className="z-50 absolute w-full h-full flex items-center justify-center bg-primary-foreground">
          Getting things ready... <Rings color="red" height={50} />
        </div>
      )}
    </div>
  );

  // Ui
  function RenderFeatureHighlightsSection() {
    return (
      <div className="text-xs text-muted-foreground">
        <ul className="space-y-4">
          <li>
            <strong>Dark Mode/Sys Theme 🌗</strong>
            <p>Toggle between dark mode and system theme.</p>
            <Button
              className="my-2 h-6 w-6"
              variant={"outline"}
              size={"icon"}
              onClick={() => setTheme("light")}
            >
              <SunIcon size={14} />
            </Button>{" "}
            /{" "}
            <Button
              className="my-2 h-6 w-6"
              variant={"outline"}
              size={"icon"}
              onClick={() => setTheme("dark")}
            >
              <MoonIcon size={14} />
            </Button>
          </li>
          <li>
            <strong>Horizontal Flip ↔️</strong>
            <p>Adjust horizontal orientation.</p>
            <Button
              className="h-6 w-6 my-2"
              variant={"outline"}
              size={"icon"}
              onClick={() => {
                setMirrored((prev) => !prev);
              }}
            >
              <FlipHorizontal size={14} />
            </Button>
          </li>
          <Separator />
          <li>
            <strong>Take Pictures 📸</strong>
            <p>Capture snapshots at any moment from the video feed.</p>
            <Button
              className="h-6 w-6 my-2"
              variant={"outline"}
              size={"icon"}
              onClick={userPromptScreenshot}
            >
              <Camera size={14} />
            </Button>
          </li>
          <li>
            <strong>Manual Video Recording 📽️</strong>
            <p>Manually record video clips as needed.</p>
            <Button
              className="h-6 w-6 my-2"
              variant={isRecording ? "destructive" : "outline"}
              size={"icon"}
              onClick={userPromptRecord}
            >
              <Video size={14} />
            </Button>
          </li>
          <Separator />
          <li>
            <strong>Enable/Disable Auto Record 🚫</strong>
            <p>
              Option to enable/disable automatic video recording whenever
              required.
            </p>
            <Button
              className="h-6 w-6 my-2"
              variant={autoRecordEnabled ? "destructive" : "outline"}
              size={"icon"}
              onClick={toggleAutoRecord}
            >
              {autoRecordEnabled ? (
                <Rings color="white" height={30} />
              ) : (
                <PersonStanding size={14} />
              )}
            </Button>
          </li>

          <li>
            <strong>Volume Slider 🔊</strong>
            <p>Adjust the volume level of the notifications.</p>
          </li>
          <li>
            <strong>Camera Feed Highlighting 🎨</strong>
            <p>
              Highlights persons in{" "}
              <span style={{ color: "#FF0F0F" }}>red</span> and other objects in{" "}
              <span style={{ color: "#00B612" }}>green</span>.
            </p>
          </li>
          <Separator />
          <li className="space-y-4">
            <strong>Share your thoughts 💬 </strong>
            {/* <SocialMediaLinks /> */}
            <br />
            <br />
            <br />
          </li>
        </ul>
      </div>
    );
  }

  //handler functions
  function userPromptScreenshot() {
    if (!webcamRef.current) {
      toast("Please enable the webcam first or refresh");
    } else {
      const imgSrc = webcamRef.current.getScreenshot();
    }
    //take picture
    //save it to downloads
  }

  function userPromptRecord() {
    if (!webcamRef.current || !webcamRef.current.video) {
      toast("Please enable the webcam first or refresh");
    }

    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.requestData();
      clearInterval(stopTimeout);
      mediaRecorderRef.current.stop();
      toast("Recording has been stopped and saved to your downloads");
    } else {
      startRecording(false);
    }

    //check if recording is already on
    //if not, start recording
    //if yes, stop recording
  }

  function startRecording(doBeep: boolean) {
    if (webcamRef.current && mediaRecorderRef.current?.state !== "recording") {
      mediaRecorderRef.current?.start();

      doBeep && beep(volume);

      stopTimeout = setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          toast("Recording has been stopped and saved to your downloads");
        }
      }, 30000);
      toast("Recording has been started");
    }
  }

  function toggleAutoRecord() {
    if (autoRecordEnabled) {
      setAutoRecordEnabled(false);
      toast("Auto recording is now off");
    } else {
      setAutoRecordEnabled(true);
      toast("Auto recording is now on");
    }
    //check if auto recording is already on
    //if not, start auto recording
    //if yes, stop auto recording
  }
}

function resizeCanvas(
  canvasRef: RefObject<HTMLCanvasElement>,
  webcamRef: RefObject<Webcam>
) {
  const canvas = canvasRef.current;
  const video = webcamRef.current?.video;

  if (canvas && video) {
    const { videoWidth, videoHeight } = video;
    canvas.width = videoWidth;
    canvas.height = videoHeight;
  }
}

function formatDate(d: Date) {
  const formattedDate =
    [
      (d.getMonth() + 1).toString().padStart(2, "0"),
      d.getDate().toString().padStart(2, "0"),
      d.getFullYear(),
    ].join("-") +
    " " +
    [
      d.getHours().toString().padStart(2, "0"),
      d.getMinutes().toString().padStart(2, "0"),
      d.getSeconds().toString().padStart(2, "0"),
    ].join("-");
  return formattedDate;
}

function base64toBlob(base64Data: any) {
  const byteCharacters = atob(base64Data.split(",")[1]);
  const arrayBuffer = new ArrayBuffer(byteCharacters.length);
  const byteArray = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  return new Blob([arrayBuffer], { type: "image/png" }); // Specify the image type here
}

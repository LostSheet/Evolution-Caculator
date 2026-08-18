import { mount } from "svelte";
import "../src/app.css";
import "./tool.css";
import Tool from "./Tool.svelte";

mount(Tool, { target: document.getElementById("tool") });

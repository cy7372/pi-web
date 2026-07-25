import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "./globals.css";
import BasePathPatch from "@/components/BasePathPatch";

export const metadata: Metadata = {
	title: "Pi Web",
	description: "Pi Web interface for the pi coding agent",
};

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html
			lang="en"
			translate="no"
			className="notranslate"
			suppressHydrationWarning
		>
			<head>
				<meta name="google" content="notranslate" />
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var t=localStorage.getItem("pi-theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})();`,
					}}
				/>
			</head>
			<body
				translate="no"
				className="notranslate"
				style={{ height: "100dvh", display: "flex", flexDirection: "column" }}
			>
				<BasePathPatch />
				{children}
			</body>
		</html>
	);
}

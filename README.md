# GoodnotesWebExporter
A playwright script that exports all Goodnotes notebooks as PDF and saves them locally in the corresponding folder structure. It works by parsing the HTML of Goodnotes Web.



# **READ BEFORE USE!:**
The script was created with the help of AI or you could also say by AI with the help of me. It is by far not flawless! I can not guarantee for anythink. Use it at your own risk!



## Way of working, issues and bad programming:
The script opens a browser and lets you login into Goodnotes Web. The cookies will then be saved in a folder to get a valid session. I advice to make sure nobody gets access to this cookie data because otherwhise they might get access to your account! Better delete the folder, which is called "gn_session_data", permanently after you finished.

After the login the script will scan all folders recursively and create a metadata.json, which contains the titles of all your notebooks, their folder path and a boolean value to save if the notebooks was already exported or not. If any errors occur during the metadata collection, delete the metadata.json completely before running the script again.

If the metadata collection is finished or the script finds an existiing metadata.json file on startup, it will start the export routine. It will go through the metadata.json file entry by entry, open the notebook and export it PDF which is saved in the Export_GoodNotes folder and subfolder corresponding to your folder structure in Goodnotes. After each export it will change the boolean value for the done entry of the metadata.json accordingly.

Because of the problems of Goodnotes Web I have set many timeout values extremely high, added some hard coded waiting times here and there and stopped using waiting for "networkidle" at some places. I also switched from exporting the PDFs directly from the view where you can see your folders & notebooks. Istead it now opens the notebooks individually, waits some time before exporting because of the slow Goodnotes servers and then exports it. Before I had issues where Goodnotes Web exported an PDF, but only the first page of the PDF actually had content and the others were empty. I checked a few files that were exported incomplete before and those were then exported completely, but I did only check very few of my 100+ files.

I know it is not perfect and takes long, but I have only little programming experience. In the end I was able to export all my notebooks with correct title as PDF and my Goodnotes folder structure. But as mentioned in the paragraph above, their is no certainty that those files contain everything as the Goodnotes PDF export function is buggy. I am not a native english speaker and translated annotations etc. myself. Please apologize any mistakes.



## In case of crashes:

Sometimes the script crashes, mainly because Goodnotes web is slow or buggy. If it crashes during the metadata collection, delete the metadata.json completely and run the script again. If it crashes during the export routine, just restart the script. It will continue with the first entry of the metadata.json that is not marked as exported yet. Before you contact me because of problems, please try to solve the issue yourself by either searching the internet or using AI.



## My specific usage:

I was using it on Windows 10 and the login into Goodnotes Web was via my Google account.



# Installation:

Install node.js and playwright according to tutorials availble online. Put the export-goodnotes.js and the package.json in the same folder. You might have to adjust the package.json, eg. the playwright version. Open an command windows, navigate to the folder with those files, and type "node export-goodnotes.js".



## Improvements/Suggestions:

If you have advice on how to improve the script, just let me know. I will then try to update the script accordingly. As I am not a professional programmer, do not tell me which features to add. Send me code and explain it please.

